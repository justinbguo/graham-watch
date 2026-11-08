import { classifyCatalogueItem } from './nonwatch.ts';
import { htmlToText } from './scrape.ts';
import {
  fetchJson,
  productKey,
  type AdapterRead,
  type ItemMeta,
  type Json,
  type SourceItem,
} from './source.ts';

// Squarespace serves originals at 4000px and several megabytes. A phone deck
// never needs more than this, and we pay for every byte we copy into storage.
const PHOTO_WIDTH = '1500w';

function toCents(money: Json): number | null {
  const value = Number(money?.value);
  // Squarespace writes 0.00 when a dealer hides the price behind an enquiry.
  // That is absence, not free.
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * The price Squarespace actually renders. Most shops repeat it at product
 * level; Goldfinger leaves that at 0.00 and puts the real amount on its only
 * variant, so stopping at the first field turns $19,950 into "Price on request".
 */
export function squarespacePrice(item: Json): {
  priceCents: number | null;
  currency: string | null;
} {
  const variants: Json[] = Array.isArray(item?.structuredContent?.variants)
    ? item.structuredContent.variants
    : [];
  const available = variants.find(
    (variant) => variant?.unlimited === true || Number(variant?.qtyInStock) > 0
  );

  const containers = [item?.structuredContent, available, ...variants, item];
  for (const container of containers) {
    const money =
      container?.onSale === true && toCents(container?.salePriceMoney) !== null
        ? container.salePriceMoney
        : container?.priceMoney;
    const priceCents = toCents(money);
    if (priceCents !== null) {
      return {
        priceCents,
        currency: typeof money?.currency === 'string' ? money.currency : null,
      };
    }
  }

  return { priceCents: null, currency: null };
}

function photoUrls(item: Json): string[] {
  const gallery = Array.isArray(item?.items) ? item.items : [];
  const urls = [item?.assetUrl, ...gallery.map((entry: Json) => entry?.assetUrl)].filter(
    (url: unknown): url is string => typeof url === 'string' && url.startsWith('http')
  );
  return [...new Set(urls)].map((url) => `${url}?format=${PHOTO_WIDTH}`);
}

function metaOf(item: Json, photoCount: number): ItemMeta {
  const variant = item?.structuredContent?.variants?.[0];
  const categories = Array.isArray(item?.categories) ? item.categories : [];
  const stamp = (value: unknown) =>
    typeof value === 'number' ? new Date(value).toISOString() : null;

  return {
    // Squarespace has no vendor field; the brand is in the title and the model
    // reads it at publish time.
    vendor: null,
    productType: categories.filter((one: unknown) => typeof one === 'string').join(', ') || null,
    sku: typeof variant?.sku === 'string' && variant.sku.trim() ? variant.sku.trim() : null,
    photoCount,
    publishedAt: stamp(item?.publishOn),
    updatedAt: stamp(item?.updatedOn),
  };
}

function mapItem(item: Json, base: URL): SourceItem | null {
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  if (!title) return null;

  const photos = photoUrls(item);

  let sourceUrl = base.toString();
  try {
    if (typeof item?.fullUrl === 'string') sourceUrl = new URL(item.fullUrl, base).toString();
  } catch {
    // Keep the collection URL; a bad product path is not worth losing the item.
  }

  // One watch is one variant with one in stock. Sold drops it to zero, which is
  // the only place a Squarespace shop admits the watch is gone.
  const variants: Json[] = Array.isArray(item?.structuredContent?.variants)
    ? item.structuredContent.variants
    : [];
  const price = squarespacePrice(item);
  const meta = metaOf(item, photos.length);
  const text = htmlToText(`${item?.excerpt ?? ''}\n${item?.body ?? ''}`, sourceUrl);
  const decision = classifyCatalogueItem({
    title,
    text,
    productType: meta.productType,
    tags: meta.tags ?? [],
    vendor: meta.vendor,
  });
  if (!photos.length && decision.decision !== 'hold') return null;

  return {
    // Squarespace's own item id survives a slug rename; fullUrl does not.
    externalId: item?.id ? `squarespace:${item.id}` : productKey(sourceUrl),
    available:
      variants.length === 0 ||
      variants.some(
        (variant: Json) => variant?.unlimited === true || Number(variant?.qtyInStock) > 0
      ),
    title,
    text,
    sourceUrl,
    photoUrls: photos,
    priceCents: price.priceCents,
    currency: price.currency,
    meta,
    ...(decision.decision === 'hold' ? { holdReason: decision.reason } : {}),
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
    // The collection's id is what the catalogue was stored under.
    externalId: collection.externalId,
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
    // Either page saying sold is enough. A grid tile can lag the product page,
    // and neither of them ever claims a sold watch is back.
    available: collection.available && product.available,
    meta: product.meta ?? collection.meta,
  };
}

/**
 * Fills in what the grid tile left out, by reading the product page itself.
 *
 * This is one HTTP request per watch, so it runs when a watch is about to be
 * published rather than when the catalogue is read. Hydrating a 300-watch shop
 * up front is 300 requests inside one invocation, which is what used to make a
 * large shop impossible to import at all.
 */
export async function hydrateSquarespaceItem(item: SourceItem): Promise<SourceItem> {
  const url = new URL(item.sourceUrl);
  url.searchParams.set('format', 'json');

  const body = await fetchJson(url);
  const product = body?.item ? mapItem(body.item, url) : null;
  return merge(item, product);
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
  limit: number,
  minPhotos = 0
): Promise<AdapterRead | null> {
  const base = new URL(sourceUrl);
  const read: AdapterRead = { items: [], skipped: [] };
  let offset: number | null = null;

  while (read.items.length < limit) {
    const page = new URL(base.toString());
    page.searchParams.set('format', 'json');
    if (offset !== null) page.searchParams.set('offset', String(offset));

    const body = await fetchJson(page);
    if (!body) return read.items.length ? read : null;

    // A product URL answers with `item`, a collection with `items`.
    const batch = Array.isArray(body.items) ? body.items : body.item ? [body.item] : null;
    if (!batch) return read.items.length ? read : null;

    for (const raw of batch) {
      const mapped = mapItem(raw, base);

      // Discard thin listings before hydration, not after: each one that
      // survives costs a product page fetch.
      if (!mapped) {
        read.skipped.push({
          sourceUrl: typeof raw?.fullUrl === 'string' ? raw.fullUrl : base.toString(),
          title: typeof raw?.title === 'string' ? raw.title : '',
          reason: typeof raw?.title === 'string' && raw.title.trim() ? 'no photograph' : 'no title',
          meta: null,
        });
      } else if (!mapped.holdReason && mapped.photoUrls.length < minPhotos) {
        read.skipped.push({
          sourceUrl: mapped.sourceUrl,
          title: mapped.title,
          reason: `${mapped.photoUrls.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
          meta: mapped.meta ?? null,
        });
      } else {
        read.items.push(mapped);
      }

      if (read.items.length >= limit) break;
    }

    const next = body.pagination?.nextPageOffset;
    if (!body.pagination?.nextPage || typeof next !== 'number' || next === offset) break;
    offset = next;
  }

  // A collection entry is only what the shop chose to show in a grid. The rest
  // arrives later, one watch at a time, from hydrateSquarespaceItem.
  return read;
}
