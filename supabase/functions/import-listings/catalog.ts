import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { extractListings } from './extract.ts';
import { contentFingerprint, textFingerprint } from './hash.ts';
import { scrape } from './scrape.ts';
import { fetchShopifyItems } from './shopify.ts';
import { productKey, type SourceItem } from './source.ts';
import { fetchSquarespaceItems } from './squarespace.ts';

/**
 * How deep a catalogue read goes. This is a read of feeds the shop publishes
 * anyway, with no model call behind it, so it can afford the whole shop where
 * the old import had to stop at what it could pay to extract in one request.
 */
export const MAX_CATALOG_ITEMS = 500;

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
  (url: string, limit: number, minPhotos: number) => Promise<SourceItem[] | null>
> = {
  shopify: fetchShopifyItems,
  squarespace: fetchSquarespaceItems,
};

/** The first adapter that recognises the shop. */
export async function adapterItems(
  sourceUrl: string,
  limit: number,
  minPhotos = MIN_PHOTOS_IN_CATALOG
): Promise<{ provider: string; items: SourceItem[] } | null> {
  for (const [name, run] of Object.entries(ADAPTERS)) {
    const items = await run(sourceUrl, limit, minPhotos);
    if (items?.length) return { provider: name, items };
  }
  return null;
}

export type CatalogRead = {
  provider: string;
  items: SourceItem[];
  /** Pre-typed by the page read, so these skip the extraction queue entirely. */
  extracted: Map<string, Record<string, unknown>>;
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
  if (found) return { provider: found.provider, items: found.items, extracted: new Map() };

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

  return { provider, items, extracted };
}

export type SyncResult = {
  provider: string;
  found: number;
  added: number;
  changed: number;
  adopted: number;
  retired: number;
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
  const { provider, items, extracted } = await readCatalog(sourceUrl, limit);
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

  const rows = await Promise.all(
    items.map(async (item) => {
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

  // Chunked because `raw` carries the shop's full prose for every watch, and a
  // 500-watch catalogue in one body is megabytes.
  for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
    const { error } = await supabase
      .from('source_items')
      .upsert(rows.slice(start, start + UPSERT_CHUNK), { onConflict: 'dealer_id,external_id' });
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

  const retired = await supabase.rpc('sync_source_availability', {
    p_dealer_id: dealerId,
    p_seen_ids: (seen ?? []).map((row) => row.id),
  });
  if (retired.error) throw new Error(retired.error.message);

  let added = 0;
  let changed = 0;
  for (const row of rows) {
    const previous = known.get(row.external_id);
    if (previous === undefined) added += 1;
    else if (previous !== row.content_hash) changed += 1;
  }

  return {
    provider,
    found: rows.length,
    added,
    changed,
    adopted: (adopted.data as number) ?? 0,
    retired: (retired.data as number) ?? 0,
    complete: items.length < limit,
  };
}
