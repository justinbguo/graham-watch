import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { ExtractorUnavailable, extractFields } from './extract.ts';
import { photosFingerprint, textFingerprint } from './hash.ts';
import { copyPhotos } from './photos.ts';
import { mapPool } from './pool.ts';
import type { SourceItem } from './source.ts';
import { hydrateSquarespaceItem } from './squarespace.ts';
import { canonicalBrand } from './taxonomy.ts';

/**
 * Watches per call. Each is one product fetch plus one OpenAI round trip, so
 * this is the knob that keeps a batch inside an invocation's wall clock. The
 * shop's catalogue size no longer enters into it: the queue lives in
 * `source_items`, and the client calls back until it is empty.
 */
export const DEFAULT_BATCH = 8;
export const MAX_BATCH = 25;

/**
 * Watches in one nightly publish request.
 *
 * The operator's publish button can take eight: a person is waiting and can
 * call again. The nightly job is unattended, and the isolate only gets two
 * seconds of CPU and 256MB. Two watches — one model call each, a handful of
 * photographs — stays inside that. The script calls again while the queue
 * in `source_items` is non-empty.
 */
export const SCHEDULED_PUBLISH_BATCH = 2;

// How many watches hydrate and copy photographs at once. OpenAI is gated
// separately, one call at a time (extract.ts): raising this does not raise
// how many chat completions are in flight, which is what a low RPM key rejects.
const EXTRACT_CONCURRENCY = 4;
const MAX_PHOTOS_PER_LISTING = 6;

// A card people tap through needs more than one angle. Below three photos a
// listing reads as an afterthought, so it does not enter the deck at all.
const MIN_PHOTOS_PER_LISTING = 3;

type SourceItemRow = {
  id: string;
  provider: string;
  source_url: string;
  raw: SourceItem;
  text_hash: string;
  content_hash: string;
  extracted: (Record<string, unknown> & { price_cents?: number | null; currency?: string | null }) | null;
  extracted_hash: string | null;
  applied_hash: string | null;
  photos_hash: string | null;
  listing_id: string | null;
};

export type BatchResult = {
  processed: number;
  published: number;
  skipped: number;
  failed: number;
  pending: number;
};

/**
 * Fills in what a catalogue read left out. Squarespace grids carry a truncated
 * teaser and a partial gallery, and the full record is on the product page —
 * one fetch, made here rather than during the catalogue read so it is paid for
 * only by watches actually being published.
 */
async function hydrate(row: SourceItemRow): Promise<SourceItem> {
  if (row.provider !== 'squarespace' || row.raw.operatorEdited) return row.raw;

  try {
    return await hydrateSquarespaceItem(row.raw);
  } catch {
    // A product page that will not answer is not worth losing the grid tile we
    // already hold.
    return row.raw;
  }
}

async function publishOne(
  supabase: SupabaseClient,
  storage: SupabaseClient,
  row: SourceItemRow
): Promise<'published' | 'skipped' | 'failed'> {
  const item = await hydrate(row);

  if (item.photoUrls.length < MIN_PHOTOS_PER_LISTING) {
    // Reported, not thrown: the row simply re-queues if the note does not land.
    const noted = await supabase
      .from('source_items')
      .update({
        error: `Only ${item.photoUrls.length} photograph${
          item.photoUrls.length === 1 ? '' : 's'
        } on the page. A listing needs ${MIN_PHOTOS_PER_LISTING}.`,
      })
      .eq('id', row.id);
    if (noted.error) console.error('skip note failed', row.id, noted.error.message);
    return 'skipped';
  }

  // Hydration can change the prose the grid showed, so the hash the model is
  // billed against is the hydrated one, not the one the catalogue read stored.
  const textHash = await textFingerprint(item);
  let fields = row.extracted;

  // The model only runs when the shop reworded something. A price cut, a sale,
  // or a new photograph all reach the deck without one.
  if (!fields || row.extracted_hash !== textHash) {
    const read = await extractFields(item.title, item.text, item.sourceUrl);
    if (!read) throw new Error('Nothing on that page read as a watch.');
    fields = { ...read, ...canonicalBrand(read.brand) };
  }

  const read = await supabase
    .from('source_items')
    .update({
      // The shop's own price and currency are facts, and they move without a
      // word of the prose changing. Merging them on every pass rather than only
      // at extraction is what makes a price cut free.
      extracted: {
        ...fields,
        price_cents: item.priceCents ?? fields.price_cents ?? null,
        currency: item.currency ?? fields.currency ?? null,
      },
      extracted_hash: textHash,
      text_hash: textHash,
    })
    .eq('id', row.id);
  if (read.error) throw new Error(read.error.message);

  const applied = await supabase.rpc('apply_source_item', { p_source_item_id: row.id });
  if (applied.error) throw new Error(applied.error.message);

  const listingId = applied.data as string;
  const photoUrls = item.photoUrls.slice(0, MAX_PHOTOS_PER_LISTING);
  const photosHash = await photosFingerprint(photoUrls);

  // Copying a gallery is the slowest thing in a batch, so it only reruns when
  // the shop's own gallery changed.
  if (photosHash !== row.photos_hash) {
    try {
      const photos = await copyPhotos(storage, listingId, photoUrls);

      // One statement, because a delete that lands without its insert leaves a
      // live listing with no photographs and the deck does not filter those out.
      const written = await supabase.rpc('replace_listing_photos', {
        p_listing_id: listingId,
        p_photos: photos,
      });
      if (written.error) throw new Error(written.error.message);

      // A failed stamp costs one repeated copy on the next pass and nothing else,
      // so it is reported rather than thrown — failing the row here would retire
      // a watch that did publish.
      const stamped = await supabase
        .from('source_items')
        .update({ photos_hash: photosHash })
        .eq('id', row.id);
      if (stamped.error) {
        console.error('photos_hash stamp failed', row.id, stamped.error.message);
      }
    } catch (error) {
      // `apply_source_item` already stamped `applied_hash`, and the queue only
      // offers rows whose hashes disagree. So the row above is finished as far
      // as the queue is concerned while its listing is live with the wrong
      // gallery — or none, which the deck shows as a card with nothing on it.
      // Unstamping puts the watch back in the queue, where clearing the error
      // this failure is about to record will pick it up again.
      const unstamped = await supabase
        .from('source_items')
        .update({ applied_hash: null })
        .eq('id', row.id);
      if (unstamped.error) {
        console.error('could not requeue after a photo failure', row.id, unstamped.error.message);
      }
      throw error;
    }
  }

  return 'published';
}

/**
 * Drains part of a shop's publish queue and reports what is left.
 *
 * Bounded on purpose. An import used to extract every watch inside one request,
 * which is what capped a shop at 40 and lost the whole job when the invocation
 * ran out of time. Progress now lives in `source_items`, so a failed batch
 * costs that batch and the next call picks up where it stopped.
 */
/** Marks every for-sale catalogue row for publish. Already-linked rows stay in the queue only when their hashes disagree. */
export async function queuePublish(supabase: SupabaseClient, dealerId: string) {
  const { error } = await supabase
    .from('source_items')
    .update({ publish: true, error: null })
    .eq('dealer_id', dealerId)
    .eq('available', true);
  if (error) throw new Error(error.message);
}

export async function publishBatch(
  supabase: SupabaseClient,
  storage: SupabaseClient,
  dealerId: string,
  batch: number
): Promise<BatchResult> {
  const queue = await supabase.rpc('pending_source_items', {
    p_dealer_id: dealerId,
    p_limit: batch,
  });
  if (queue.error) throw new Error(queue.error.message);

  const rows = (queue.data ?? []) as SourceItemRow[];

  let unavailable: ExtractorUnavailable | null = null;

  const outcomes = await mapPool(rows, EXTRACT_CONCURRENCY, async (row) => {
    try {
      return await publishOne(supabase, storage, row);
    } catch (error) {
      // The extractor being down is not this watch's fault — retries have
      // already been spent inside the call — so the row keeps a clean slate
      // and the whole batch is reported as failed instead. A rejected key has
      // to win over a sibling watch's rate limit, or the nightly job would
      // keep going and fail the same way on every shop.
      if (error instanceof ExtractorUnavailable) {
        if (!unavailable || error.config) unavailable = error;
        return 'failed' as const;
      }

      // Everything else is recorded on the row rather than thrown: one
      // unreadable watch must not sink a batch, and pending_source_items skips
      // rows holding an error so a bad one cannot stall the queue behind it.
      const noted = await supabase
        .from('source_items')
        .update({ error: error instanceof Error ? error.message : 'Could not read that watch.' })
        .eq('id', row.id);
      // If the note itself fails the row stays queued and this batch retries it
      // next pass, so the loop is visible in logs rather than silent.
      if (noted.error) console.error('failure note failed', row.id, noted.error.message);
      return 'failed' as const;
    }
  });

  if (unavailable) throw unavailable;

  const counts = await supabase.rpc('pending_source_item_count', { p_dealer_id: dealerId });

  return {
    processed: rows.length,
    published: outcomes.filter((outcome) => outcome === 'published').length,
    skipped: outcomes.filter((outcome) => outcome === 'skipped').length,
    failed: outcomes.filter((outcome) => outcome === 'failed').length,
    pending: counts.data?.[0]?.pending ?? 0,
  };
}
