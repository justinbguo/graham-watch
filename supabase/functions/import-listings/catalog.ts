import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { extractListings } from './extract.ts';
import { contentFingerprint, textFingerprint } from './hash.ts';
import { scrape } from './scrape.ts';
import { fetchShopifyItems } from './shopify.ts';
import {
  catalogueComplete,
  productKey,
  type AdapterRead,
  type SkippedItem,
  type SourceItem,
} from './source.ts';
import { fetchSquarespaceItems } from './squarespace.ts';

/**
 * How many watches one read may keep. Past this the read is incomplete, and
 * an incomplete read must not retire a watch just because it was not seen.
 *
 * 10000 rather than 1000 because the cap counts the sold archive, and that
 * archive is the bulk of a vintage shop. Danny's Vintage Watches publish
 * about 4300 products and Craft + Tailored about 3700. A 1000 cap stopped
 * inside the watches that are still for sale, then refused to retire anything
 * that fell off the end. 10000 is the same budget as 40 Shopify pages of 250.
 */
export const MAX_CATALOG_ITEMS = 10_000;

/**
 * A grid tile sometimes carries one photo and the product page carries eight,
 * and the catalogue read no longer opens product pages. Anything with a picture
 * is kept here; the real floor is applied at publish time, after hydration.
 */
const MIN_PHOTOS_IN_CATALOG = 1;

/** Rows per upsert. Each carries the shop's full prose for one watch. */
const UPSERT_CHUNK = 100;

/**
 * Two ways in. If the site hands us its own structured data we take it, keeping
 * the shop's own stock state intact. Otherwise we scrape the page and ask the
 * model to find the watches, which is the same job with worse inputs.
 */
const ADAPTERS: Record<
  string,
  (url: string, limit: number, minPhotos: number) => Promise<AdapterRead | null>
> = {
  shopify: fetchShopifyItems,
  squarespace: fetchSquarespaceItems,
};

/**
 * The first adapter that recognises the shop.
 *
 * Recognised, not productive: a shop whose every product was discarded still
 * belongs to its adapter, and falling through to the scraper there would pay a
 * model call to re-read a feed we already understood.
 */
export async function adapterItems(
  sourceUrl: string,
  limit: number,
  minPhotos = MIN_PHOTOS_IN_CATALOG
): Promise<{ provider: string } & AdapterRead | null> {
  for (const [name, run] of Object.entries(ADAPTERS)) {
    const read = await run(sourceUrl, limit, minPhotos);
    // `recognized` covers a feed that answered and kept nothing. Without it an
    // empty Shopify shop fell through to the scraper.
    if (read && (read.recognized || read.items.length || read.skipped.length)) {
      return { provider: name, ...read };
    }
  }
  return null;
}

export type CatalogRead = {
  provider: string;
  items: SourceItem[];
  /** What the shop publishes that is not a watch we can hold, and why. */
  skipped: SkippedItem[];
  /** Pre-typed by the page read, so these skip the extraction queue entirely. */
  extracted: Map<string, Record<string, unknown>>;
  /** False when the walk stopped before the feed ended. See catalogueComplete. */
  complete?: boolean;
};

/**
 * Reads a shop's catalogue without publishing anything.
 *
 * The adapter path costs nothing but HTTP. The fallback path has to ask the
 * model to find the watches on the page, but that is one call for the whole
 * page rather than one per watch, so a catalogue read stays cheap either way.
 */
export async function readCatalog(sourceUrl: string, limit: number): Promise<CatalogRead> {
  const found = await adapterItems(sourceUrl, limit);
  if (found) {
    return {
      provider: found.provider,
      items: found.items,
      skipped: found.skipped,
      extracted: new Map(),
      complete: found.complete,
    };
  }

  const { markdown, provider } = await scrape(sourceUrl);
  const listings = await extractListings(markdown, sourceUrl);

  const items: SourceItem[] = [];
  const extracted = new Map<string, Record<string, unknown>>();

  for (const listing of listings) {
    const itemUrl = listing.source_url ?? sourceUrl;
    const externalId = productKey(itemUrl);
    const photoUrls = listing.photo_urls.filter((url) => url.startsWith('http'));

    items.push({
      externalId,
      title: [listing.brand, listing.model].filter(Boolean).join(' '),
      // The page read already turned prose into fields, so there is nothing
      // left for a second model call to read.
      text: listing.description ?? '',
      sourceUrl: itemUrl,
      photoUrls,
      priceCents: listing.price_cents,
      currency: listing.currency,
      // A scraped page states no stock. The extractor is told to skip anything
      // marked sold, which is weaker than a feed but all this path has.
      available: true,
    });

    const { photo_urls: _photos, source_url: _source, ...fields } = listing;
    extracted.set(externalId, fields);
  }

  // The extractor is asked for watches and returns watches, so there is no
  // discard pile on this path — anything it passed over left no record.
  // One page is the whole of this path. Under the cap it still reports
  // complete, which is the old behaviour: the scrape does not know the shop
  // has another page.
  return { provider, items, skipped: [], extracted, complete: items.length < limit };
}

export type SyncResult = {
  provider: string;
  found: number;
  added: number;
  changed: number;
  adopted: number;
  retired: number;
  /** Watches a feed-sourced sold cleared because the shop listed them again. */
  relisted: number;
  /** For sale right now, of the ones found. The rest are the shop's sold stock. */
  forSale: number;
  /** Products the shop publishes that this read refused, and will not hold. */
  skipped: number;
  /** False when the shop has more watches than one read is allowed to walk. */
  complete: boolean;
};

/**
 * Reconciles a shop's catalogue into `source_items`: one upsert per product,
 * then availability against what the read actually saw.
 *
 * This is the whole of a refresh that touches the dealer's site. It is
 * idempotent — running it twice in a row changes nothing the second time — so
 * the same call serves a dealer tapping refresh, a first connection, and a
 * schedule later on.
 */
export async function syncCatalog(
  supabase: SupabaseClient,
  dealerId: string,
  sourceUrl: string,
  limit: number
): Promise<SyncResult> {
  const { provider, items, skipped, extracted, complete: feedComplete } = await readCatalog(
    sourceUrl,
    limit
  );
  const readAt = new Date().toISOString();

  const { data: before } = await supabase
    .from('source_items')
    .select('external_id, content_hash')
    .eq('dealer_id', dealerId);

  const known = new Map((before ?? []).map((row) => [row.external_id, row.content_hash]));

  // Either the whole read is pre-typed (the page path types every watch on the
  // way past) or none of it is. Mixing the two would make a ragged payload, and
  // PostgREST needs every row in a bulk upsert to carry the same keys.
  const preTyped = extracted.size > 0;

  // Built and written a chunk at a time. `raw` is the shop's full prose, so
  // a second array of every watch would sit next to `items` until the request
  // ended. The isolate has 256MB, and the catalogue read shares it with
  // nothing else only because publish is a later request.
  let added = 0;
  let changed = 0;
  for (let start = 0; start < items.length; start += UPSERT_CHUNK) {
    const rows = await Promise.all(
      items.slice(start, start + UPSERT_CHUNK).map(async (item) => {
        const textHash = await textFingerprint(item);

        return {
          dealer_id: dealerId,
          provider,
          external_id: item.externalId,
          source_url: item.sourceUrl,
          raw: item,
          text_hash: textHash,
          content_hash: await contentFingerprint(item),
          available: item.available,
          last_seen_at: readAt,
          error: null,
          // publish, applied_hash, photos_hash, listing_id and first_seen_at are
          // omitted on purpose: PostgREST only overwrites the keys it is sent, so
          // leaving them out is what preserves a dealer's choices across a
          // refresh. Sending `extracted: null` here would throw away every
          // extraction we have paid for.
          ...(preTyped
            ? { extracted: extracted.get(item.externalId) ?? null, extracted_hash: textHash }
            : {}),
        };
      })
    );

    for (const row of rows) {
      const previous = known.get(row.external_id);
      if (previous === undefined) added += 1;
      else if (previous !== row.content_hash) changed += 1;
    }

    const { error } = await supabase
      .from('source_items')
      .upsert(rows, { onConflict: 'dealer_id,external_id' });
    if (error) throw new Error(error.message);
  }

  const adopted = await supabase.rpc('adopt_existing_listings', { p_dealer_id: dealerId });
  if (adopted.error) throw new Error(adopted.error.message);

  // Which rows this read actually saw, by the stamp the upsert just wrote.
  // Listing the ids in the query instead puts 500 uuids in a URL.
  const { data: seen } = await supabase
    .from('source_items')
    .select('id')
    .eq('dealer_id', dealerId)
    .gte('last_seen_at', readAt);

  const complete = catalogueComplete({ items, complete: feedComplete }, limit);
  const availability = await supabase.rpc('sync_source_availability', {
    p_dealer_id: dealerId,
    p_seen_ids: (seen ?? []).map((row) => row.id),
    p_read_complete: complete,
  });
  if (availability.error) throw new Error(availability.error.message);

  const counts = (availability.data ?? {}) as { retired?: number; relisted?: number };
  const retired = Number(counts.retired ?? 0);
  const relisted = Number(counts.relisted ?? 0);

  return {
    provider,
    found: items.length,
    added,
    changed,
    adopted: (adopted.data as number) ?? 0,
    retired,
    relisted,
    forSale: items.filter((item) => item.available).length,
    skipped: skipped.length,
    complete,
  };
}
