import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { extractListings } from './extract.ts';
import { contentFingerprint, textFingerprint } from './hash.ts';
import { scrape } from './scrape.ts';
import { fetchShopifyItems, type ShopifyIO } from './shopify.ts';
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
 * PostgREST returns at most this many rows when the caller does not ask for
 * the next page. Danny's catalogue is about 4,300 rows. Treating the first
 * page as the whole shop both inflated "added" and sold listings whose rows
 * were on a later page.
 */
export const PAGE_ROWS = 1000;

export async function everyRow<T extends { id: string }>(
  load: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await load(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    let fresh = 0;
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      fresh += 1;
    }
    if (fresh === 0 || page.length < PAGE_ROWS) return rows;
  }
}

/** The stamp for this refresh. A caller-supplied time has to be from this run. */
export function readStamp(input: string | undefined, now = Date.now()): string {
  const ms = input ? new Date(input).getTime() : Number.NaN;
  if (!Number.isFinite(ms) || Math.abs(now - ms) > 6 * 60 * 60 * 1000) {
    return new Date(now).toISOString();
  }
  return new Date(ms).toISOString();
}

/**
 * Two ways in. If the site hands us its own structured data we take it, keeping
 * the shop's own stock state intact. Otherwise we scrape the page and ask the
 * model to find the watches, which is the same job with worse inputs.
 */
const ADAPTERS: Record<
  string,
  (
    url: string,
    limit: number,
    minPhotos: number,
    slice?: CatalogSlice
  ) => Promise<AdapterRead | null>
> = {
  shopify: (url, limit, minPhotos, slice) =>
    fetchShopifyItems(url, limit, minPhotos, {
      startPage: slice?.startPage,
      maxPages: slice?.maxPages,
      pageSize: slice?.pageSize,
      fetchText: slice?.fetchText,
      pause: slice?.pause,
    }),
  squarespace: (url, limit, minPhotos) => fetchSquarespaceItems(url, limit, minPhotos),
};

export const PAGES_PER_CALL = 1;

/** One slice of a Shopify feed. Absent means read the feed in this call. */
export type CatalogSlice = {
  startPage?: number;
  maxPages?: number;
  pageSize?: number;
  fetchText?: ShopifyIO['fetchText'];
  pause?: ShopifyIO['pause'];
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
  minPhotos = MIN_PHOTOS_IN_CATALOG,
  slice?: CatalogSlice
): Promise<{ provider: string } & AdapterRead | null> {
  for (const [name, run] of Object.entries(ADAPTERS)) {
    const read = await run(sourceUrl, limit, minPhotos, slice);
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
  /** Set when a Shopify call stopped on its page budget. */
  nextPage?: number;
};

/**
 * Reads a shop's catalogue without publishing anything.
 *
 * The adapter path costs nothing but HTTP. The fallback path has to ask the
 * model to find the watches on the page, but that is one call for the whole
 * page rather than one per watch, so a catalogue read stays cheap either way.
 */
export async function readCatalog(
  sourceUrl: string,
  limit: number,
  slice?: CatalogSlice
): Promise<CatalogRead> {
  const found = await adapterItems(sourceUrl, limit, MIN_PHOTOS_IN_CATALOG, slice);
  if (found) {
    return {
      provider: found.provider,
      items: found.items,
      skipped: found.skipped,
      extracted: new Map(),
      complete: found.complete,
      nextPage: found.nextPage,
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

  // One scraped page is not the shop. On 8 Nov 2026 Cool Vintage's homepage
  // scraped as zero watches and a "complete" read sold all 85 listings.
  return { provider, items, skipped: [], extracted, complete: false };
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
  /** Next Shopify page when this call stopped on a budget. */
  nextPage?: number;
};

export type SyncOptions = CatalogSlice & {
  /** Shared by every slice of one nightly run, so absence is judged once at the end. */
  readAt?: string;
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
  limit: number,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { provider, items, skipped, extracted, complete: feedComplete, nextPage } = await readCatalog(
    sourceUrl,
    limit,
    options
  );
  const readAt = readStamp(options.readAt);

  const before = await everyRow<{ id: string; external_id: string; content_hash: string }>(
    (from, to) =>
      supabase
        .from('source_items')
        .select('id, external_id, content_hash')
        .eq('dealer_id', dealerId)
        .order('id')
        .range(from, to)
  );

  const known = new Map(before.map((row) => [row.external_id, row.content_hash]));

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
          hold_reason: item.holdReason ?? null,
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
      if (row.hold_reason) continue;
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
  // PostgREST returns 1000 rows unless the caller pages. Danny's catalogue is
  // about 4,300, and the first page is not the shop.
  const held = await supabase
    .from('source_items')
    .update({ publish: false })
    .eq('dealer_id', dealerId)
    .not('hold_reason', 'is', null);
  if (held.error) throw new Error(held.error.message);

  const seen = await everyRow<{ id: string }>((from, to) =>
    supabase
      .from('source_items')
      .select('id')
      .eq('dealer_id', dealerId)
      .gte('last_seen_at', readAt)
      .order('id')
      .range(from, to)
  );

  const feedEnded = nextPage == null && catalogueComplete({ items, complete: feedComplete }, limit);
  const complete = feedEnded;
  const availability = await supabase.rpc('sync_source_availability', {
    p_dealer_id: dealerId,
    p_seen_ids: (seen ?? []).map((row) => row.id),
    p_read_complete: complete,
  });
  if (availability.error) throw new Error(availability.error.message);

  const counts = (availability.data ?? {}) as { retired?: number; relisted?: number };
  const retired = Number(counts.retired ?? 0);
  const relisted = Number(counts.relisted ?? 0);

  // A product that left a finished feed stays available in source_items
  // otherwise, and the catalogue count keeps offering it.
  if (complete) {
    const stale = await supabase
      .from('source_items')
      .update({ available: false, publish: false })
      .eq('dealer_id', dealerId)
      .lt('last_seen_at', readAt);
    if (stale.error) throw new Error(stale.error.message);
  }

  const watches = items.filter((item) => !item.holdReason);

  return {
    provider,
    found: watches.length,
    added,
    changed,
    adopted: (adopted.data as number) ?? 0,
    retired,
    relisted,
    forSale: watches.filter((item) => item.available).length,
    skipped: skipped.length + (items.length - watches.length),
    complete,
    ...(nextPage != null ? { nextPage } : {}),
  };
}
