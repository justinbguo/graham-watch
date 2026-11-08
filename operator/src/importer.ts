/**
 * Calling the import function from the console.
 *
 * The same four actions the terminal tools use, so there is one implementation
 * of "read a shop" and this app cannot drift from `npm run dealers -- add`.
 *
 * Nothing here is safe to call in a loop without thought: `sync` reads a shop
 * we do not own and `importListings` spends a model call per watch. The screens
 * are what make each one deliberate.
 */

import { supabase, type Database } from './supabase';

export type Profile = {
  description: string | null;
  instagram: string | null;
  logoUrl: string | null;
};

export type Discovery = {
  origin: string;
  name: string;
  email: string | null;
  catalogUrl: string;
  /** Product URLs in their sitemap — sold stock included. Not what is for sale. */
  sitemapProducts: number;
  platform: string;
  sawSitemap: boolean;
  profile: Profile;
};

/** One product as the shop publishes it, kept by a read or refused with a reason. */
export type PreviewProduct = {
  source_url: string;
  external_id: string | null;
  title: string;
  price_cents: number | null;
  currency: string | null;
  photo_url: string | null;
  photo_count: number;
  available: boolean;
  vendor: string | null;
  product_type: string | null;
  sku: string | null;
  published_at: string | null;
  updated_at: string | null;
  skipped: string | null;
};

export type Preview = {
  provider: string;
  /** False when the walk stopped before the feed ended. Absent on an older function. */
  complete?: boolean;
  counts: { read: number; for_sale: number; sold: number; skipped: number };
  listings: PreviewProduct[];
};

export type SyncResult = {
  dealerId: string;
  provider: string;
  found: number;
  added: number;
  changed: number;
  retired: number;
  forSale: number;
  skipped: number;
  complete: boolean;
};

export type PublishTotals = {
  processed: number;
  published: number;
  skipped: number;
  failed: number;
  pending: number;
};

/**
 * Where one of the shop's watches stands with us.
 *
 * `imported` rows are in the deck already and are here to be seen, not chosen:
 * the question this screen answers is "what does this shop have that we do
 * not", and that cannot be read from a list of only the things we lack.
 */
export type CandidateState = 'new' | 'queued' | 'imported' | 'failed';

export type ImportCandidate = {
  id: string;
  sourceUrl: string;
  title: string;
  description: string;
  priceCents: number | null;
  currency: string | null;
  photoUrls: string[];
  state: CandidateState;
  error: string | null;
  selected: boolean;
  edited: boolean;
};

/** One read of a shop's catalogue. Enough for any dealer we have met. */
export const CANDIDATE_LIMIT = 500;

/** A guard on a bug, not a limit on a shop. Each pass reports what is left. */
const MAX_PASSES = 200;

/**
 * Watches per publish request. Higher = fewer round trips from the browser;
 * the edge function has ~150s, so this stays below the nightly cap of 25.
 */
export const PUBLISH_BATCH = 15;

/**
 * `functions.invoke` swallows the body of a failed response and reports
 * "non-2xx status", which throws away the only useful part: the function says
 * why in `error`, and a 429 has to be told apart from a bad domain.
 */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Signed out. Reload and sign in again.');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-listings`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const failure = new Error(parsed?.error ?? `The import function returned ${response.status}.`);
    // The bulk screen waits out a budget refusal and reports everything else,
    // so it has to be able to tell them apart.
    (failure as Error & { status?: number }).status = response.status;
    throw failure;
  }

  return parsed as T;
}

export function discoverShop(domain: string): Promise<Discovery> {
  return call<Discovery>({ action: 'discover', domain });
}

/**
 * Deletes one imported watch for good, with its photographs, saves and
 * inquiries. The dealer's catalogue row survives and can be imported again.
 */
export function deleteListing(listingId: string): Promise<{ photos: number }> {
  return call<{ photos: number }>({ action: 'delete-listing', listingId });
}

/** Removes the shop, every imported watch, and catalogue rows. Irreversible. */
export function deleteDealer(dealerId: string): Promise<{ photos: number }> {
  return call<{ photos: number }>({ action: 'delete-dealer', dealerId });
}

/**
 * Reads a shop's whole catalogue and writes nothing.
 *
 * The only way to answer what a shop actually holds before we take it on: a
 * sitemap count says 970 where 87 are for sale, and the gap is per product.
 * Costs HTTP on a platform we have an adapter for, and spends one of the
 * hour's new-shop budget because it reads a site nobody here owns yet.
 */
export async function previewShop(sourceUrl: string): Promise<Preview> {
  const preview = await call<Preview>({ action: 'preview', sourceUrl });

  // The console and the import function deploy separately, and the one that
  // shipped before this screen answers with `listings` and no `counts`.
  // Reading through the missing field threw during render, which unmounts
  // React and leaves a black page — no message, nothing to click.
  if (!preview?.counts || !Array.isArray(preview.listings)) {
    throw new Error(
      'The import function on this project is older than this console: it answered without product counts. Deploy it with `npx supabase functions deploy import-listings`, then read the shop again.'
    );
  }

  return preview;
}

/**
 * Reads the shop's catalogue into source_items, creating the shop if it is new.
 *
 * Costs HTTP and nothing else on Shopify and Squarespace. New shops land at
 * `pending`, so this can never put a watch in front of a buyer.
 */
export function syncCatalog(input: {
  sourceUrl: string;
  dealerName?: string;
  dealerEmail?: string;
  dealerId?: string;
}): Promise<SyncResult> {
  return call<SyncResult>({ action: 'sync', ...input });
}

/**
 * Marks every for-sale catalogue row for publish, like the nightly job after
 * sync. Publish still skips watches without enough photos or already imported.
 */
export function queueCatalogForPublish(dealerId: string): Promise<{ pending: number }> {
  return call<{ pending: number }>({ action: 'queue-publish', dealerId });
}

type SourceItemDraft = {
  id: string;
  source_url: string;
  raw: Database['public']['Tables']['source_items']['Row']['raw'];
  publish: boolean;
  listing_id: string | null;
  error: string | null;
};

type Json = Database['public']['Tables']['source_items']['Row']['raw'];
type RawSourceItem = { [key: string]: Json | undefined };

function asRaw(value: Json): RawSourceItem {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RawSourceItem)
    : {};
}

/**
 * Everything the shop currently has for sale, and what we have done with each.
 *
 * Nothing is selected but the rows an earlier run already committed to. Each
 * watch here costs a model call and a photo download, so the screen never
 * arrives with a bill pre-ticked — the toolbar's select-all is one click and
 * says how many it is choosing.
 */
export async function importCandidates(dealerId: string): Promise<ImportCandidate[]> {
  const { data, error } = await supabase
    .from('source_items')
    .select('id, source_url, raw, publish, listing_id, error')
    .eq('dealer_id', dealerId)
    .eq('available', true)
    .is('hold_reason', null)
    .order('first_seen_at', { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (error) throw error;

  return ((data ?? []) as SourceItemDraft[]).map((row) => {
    const raw = asRaw(row.raw);
    const state: CandidateState = row.listing_id
      ? 'imported'
      : row.error
        ? 'failed'
        : row.publish
          ? 'queued'
          : 'new';
    const photos = Array.isArray(raw.photoUrls)
      ? raw.photoUrls.filter((url): url is string => typeof url === 'string')
      : [];

    return {
      id: row.id,
      sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl : row.source_url,
      title: typeof raw.title === 'string' ? raw.title : 'Untitled watch',
      description: typeof raw.text === 'string' ? raw.text : '',
      priceCents: typeof raw.priceCents === 'number' ? raw.priceCents : null,
      currency: typeof raw.currency === 'string' ? raw.currency : null,
      photoUrls: photos,
      state,
      error: row.error,
      selected: state === 'queued',
      edited: false,
    };
  });
}

async function fingerprint(parts: string[]): Promise<string> {
  const value = parts.join('\u0000');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Saves the reviewed source fields and makes the ticked rows the exact queue.
 * Unticking leaves the watch in the catalogue, so a later read offers it again.
 */
export async function stageImport(
  dealerId: string,
  candidates: ImportCandidate[]
): Promise<number> {
  const choosable = candidates.filter((candidate) => candidate.state !== 'imported');
  const wanted = choosable.filter((candidate) => candidate.selected);
  const removedQueued = choosable.filter(
    (candidate) => candidate.state === 'queued' && !candidate.selected
  );

  // Refresh and selection run on different clocks. Re-read availability after
  // the refresh immediately before this call, so a watch sold while the picker
  // was open cannot be queued from stale React state.
  const { data: available, error: availabilityError } = await supabase
    .from('source_items')
    .select('id')
    .eq('dealer_id', dealerId)
    .eq('available', true)
    .in(
      'id',
      wanted.map((candidate) => candidate.id)
    );
  if (availabilityError) throw availabilityError;

  const availableIds = new Set((available ?? []).map((row) => row.id));
  const selected = wanted.filter((candidate) => availableIds.has(candidate.id));
  const soldSinceSelection = wanted.filter((candidate) => !availableIds.has(candidate.id));

  if (soldSinceSelection.length > 0) {
    const { error } = await supabase
      .from('source_items')
      .update({ publish: false })
      .eq('dealer_id', dealerId)
      .in(
        'id',
        soldSinceSelection.map((candidate) => candidate.id)
      );
    if (error) throw error;
  }

  if (removedQueued.length > 0) {
    const { error } = await supabase
      .from('source_items')
      .update({ publish: false })
      .eq('dealer_id', dealerId)
      .in(
        'id',
        removedQueued.map((candidate) => candidate.id)
      );
    if (error) throw error;
  }

  for (const candidate of selected) {
    if (!candidate.edited) {
      const { error } = await supabase
        .from('source_items')
        .update({ publish: true, error: null })
        .eq('dealer_id', dealerId)
        .eq('id', candidate.id)
        .is('hold_reason', null);
      if (error) throw error;
      continue;
    }

    const { data: current, error: readError } = await supabase
      .from('source_items')
      .select('raw')
      .eq('dealer_id', dealerId)
      .eq('id', candidate.id)
      .single();
    if (readError) throw readError;

    const raw = asRaw(current.raw);
    const nextRaw = {
      ...raw,
      operatorEdited: true,
      title: candidate.title.trim(),
      text: candidate.description.trim(),
      sourceUrl: candidate.sourceUrl,
      photoUrls: candidate.photoUrls,
      priceCents: candidate.priceCents,
      currency: candidate.currency,
    };
    const textHash = await fingerprint([nextRaw.title, nextRaw.text]);
    const contentHash = await fingerprint([
      nextRaw.title,
      nextRaw.text,
      String(nextRaw.priceCents ?? ''),
      nextRaw.currency ?? '',
      raw.available === false ? 'out' : 'in',
      candidate.photoUrls.join(','),
    ]);

    const { error } = await supabase
      .from('source_items')
      .update({
        raw: nextRaw,
        text_hash: textHash,
        content_hash: contentHash,
        publish: true,
        error: null,
      })
      .eq('dealer_id', dealerId)
      .eq('id', candidate.id)
      .is('hold_reason', null);
    if (error) throw error;
  }

  return selected.length;
}

/**
 * Drains the import queue in bounded batches.
 *
 * The batch keeps each request inside its wall clock; the loop makes the shop's
 * size irrelevant. Closing the tab half way leaves the rest queued rather than
 * lost — `catalog_queued` on the shop is what is left, and running this again
 * picks it up.
 */
export async function importListings(
  dealerId: string,
  onProgress?: (totals: PublishTotals) => void,
  onLog?: (message: string) => void
): Promise<PublishTotals> {
  const totals: PublishTotals = {
    processed: 0,
    published: 0,
    skipped: 0,
    failed: 0,
    pending: 0,
  };

  onLog?.(
    `Draining the queue in batches of ${PUBLISH_BATCH}. Each watch needs one AI read plus photos — often several minutes for a large shop.`
  );

  const jobStarted = Date.now();

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    onLog?.(`Batch ${pass + 1}: calling import-listings (${PUBLISH_BATCH} watches max)…`);
    const started = Date.now();
    const batch = await call<PublishTotals>({ action: 'publish', dealerId, batch: PUBLISH_BATCH });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    totals.processed += batch.processed;
    totals.published += batch.published;
    totals.skipped += batch.skipped;
    totals.failed += batch.failed;
    totals.pending = batch.pending;

    onLog?.(
      `Batch ${pass + 1} (${seconds}s): processed ${batch.processed}, published ${batch.published}, skipped ${batch.skipped}, failed ${batch.failed}, ${batch.pending} still queued`
    );

    if (totals.published > 0 && totals.pending > 0) {
      const elapsedSec = (Date.now() - jobStarted) / 1000;
      const perWatch = elapsedSec / totals.published;
      const etaSec = Math.round(perWatch * totals.pending);
      onLog?.(`Roughly ${formatEta(etaSec)} left at this pace.`);
    }

    onProgress?.({ ...totals });
    if (batch.pending === 0 || batch.processed === 0) break;
  }

  if (totals.pending > 0) {
    onLog?.(`Stopped after ${MAX_PASSES} batches with ${totals.pending} still queued. Run import again to continue.`);
  } else if (totals.processed === 0) {
    onLog?.('Queue was empty — nothing to publish in this pass.');
  } else {
    onLog?.(
      `Done. ${totals.published} published, ${totals.skipped} skipped (usually photos), ${totals.failed} failed.`
    );
  }

  return totals;
}

function formatEta(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatPrice(cents: number | null, currency: string | null): string {
  if (!cents) return 'on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** The bucket is public, so a path is all the client needs to show a photo. */
export function photoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`;
}
