import { mapPool } from './pool.ts';
import { htmlToText } from './scrape.ts';
import { fetchJson, type Json, type SourceItem } from './source.ts';

// Squarespace serves originals at 4000px and several megabytes. A phone deck
// never needs more than this, and we pay for every byte we copy into storage.
const PHOTO_WIDTH = '1500w';

// Product pages are fetched one per listing. Four at a time is brisk for us and
// unremarkable traffic for the dealer.
const HYDRATE_CONCURRENCY = 4;

function toCents(money: Json): number | null {
  const value = Number(money?.value);
  // Squarespace writes 0.00 when a dealer hides the price behind an enquiry.
  // That is absence, not free.
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function photoUrls(item: Json): string[] {
  const gallery = Array.isArray(item?.items) ? item.items : [];
  const urls = [item?.assetUrl, ...gallery.map((entry: Json) => entry?.assetUrl)].filter(
    (url: unknown): url is string => typeof url === 'string' && url.startsWith('http')
  );
  return [...new Set(urls)].map((url) => `${url}?format=${PHOTO_WIDTH}`);
}

function mapItem(item: Json, base: URL): SourceItem | null {
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!title) return null;

  const photos = photoUrls(item);
  if (!photos.length) return null;

  let sourceUrl = base.toString();
  try {
    if (typeof item?.fullUrl === 'string') sourceUrl = new URL(item.fullUrl, base).toString();
  } catch {
    // Keep the collection URL; a bad product path is not worth losing the item.
  }

  const money = item?.structuredContent?.priceMoney;

  return {
    title,
    text: htmlToText(`${item?.excerpt ?? ''}\n${item?.body ?? ''}`, sourceUrl),
    sourceUrl,
    photoUrls: photos,
    priceCents: toCents(money),
    currency: typeof money?.currency === 'string' ? money.currency : null,
  };
}

/**
 * A collection entry is whatever the shop chose to show in a grid. The full
 * description and the rest of the gallery usually live on the product page, so
 * prefer that and keep the collection values as a floor. Some shops, Goldfinger
 * among them, send everything up front and this changes nothing.
 */
function merge(collection: SourceItem, product: SourceItem | null): SourceItem {
  if (!product) return collection;

  return {
    title: product.title || collection.title,
    text: product.text.length >= collection.text.length ? product.text : collection.text,
    // The collection's own link is the canonical one we dedupe on.
    sourceUrl: collection.sourceUrl,
    photoUrls:
      product.photoUrls.length >= collection.photoUrls.length
        ? product.photoUrls
        : collection.photoUrls,
    priceCents: product.priceCents ?? collection.priceCents,
    currency: product.currency ?? collection.currency,
  };
}

async function hydrate(items: SourceItem[]): Promise<SourceItem[]> {
  return mapPool(items, HYDRATE_CONCURRENCY, async (item) => {
    const url = new URL(item.sourceUrl);
    url.searchParams.set('format', 'json');

    const body = await fetchJson(url);
    const product = body?.item ? mapItem(body.item, url) : null;
    return merge(item, product);
  });
}

/**
 * Squarespace answers any collection or product URL with JSON when asked, which
 * hands us titles, prose, prices and full image galleries as data. Scraping the
 * rendered page instead means parsing five megabytes of markup to recover facts
 * the site was willing to state outright.
 *
 * Returns null when the URL is not a Squarespace collection, so the caller can
 * fall back to the generic scrape-and-extract path.
 */
export async function fetchSquarespaceItems(
  sourceUrl: string,
  limit: number
): Promise<SourceItem[] | null> {
  const base = new URL(sourceUrl);
  const items: SourceItem[] = [];
  let offset: number | null = null;
  let isCollection = false;

  while (items.length < limit) {
    const page = new URL(base.toString());
    page.searchParams.set('format', 'json');
    if (offset !== null) page.searchParams.set('offset', String(offset));

    const body = await fetchJson(page);
    if (!body) return items.length ? items : null;

    // A product URL answers with `item`, a collection with `items`.
    const batch = Array.isArray(body.items) ? body.items : body.item ? [body.item] : null;
    if (!batch) return items.length ? items : null;
    isCollection ||= Array.isArray(body.items);

    for (const raw of batch) {
      const mapped = mapItem(raw, base);
      if (mapped) items.push(mapped);
      if (items.length >= limit) break;
    }

    const next = body.pagination?.nextPageOffset;
    if (!body.pagination?.nextPage || typeof next !== 'number' || next === offset) break;
    offset = next;
  }

  // A product URL was already the detail page; there is nothing deeper to read.
  return isCollection ? hydrate(items) : items;
}
