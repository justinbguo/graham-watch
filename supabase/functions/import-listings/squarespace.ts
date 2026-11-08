import { classifyCatalogueItem } from './nonwatch.ts';
import { htmlToText } from './scrape.ts';
import {
  fetchJson,
  fetchText,
  productKey,
  type AdapterRead,
  type ItemMeta,
  type Json,
  type SourceItem,
  type TextResponse,
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

const IMAGE_FILE = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i;

/**
 * Gallery frames are the photographs. Squarespace's product root is sometimes
 * a directory with no filename, and that URL answers 200 with the platform's
 * no-image PNG. A root is kept only when it names an image and the gallery
 * does not already include it.
 */
export function squarespacePhotoUrls(item: Json): string[] {
  const gallery = Array.isArray(item?.items) ? item.items : [];
  const urls: string[] = [];
  for (const entry of gallery) {
    const asset = (entry as Json)?.assetUrl;
    if (typeof asset === 'string' && asset.startsWith('http')) urls.push(asset);
  }
  const root = typeof item?.assetUrl === 'string' ? item.assetUrl : '';
  const rootPath = root.split(/[?#]/)[0];
  const seen = new Set(urls.map((url) => url.split(/[?#]/)[0]));
  if (root.startsWith('http') && IMAGE_FILE.test(rootPath) && !seen.has(rootPath)) urls.push(root);

  return [...new Set(urls)].map((url) => {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('format', PHOTO_WIDTH);
      return parsed.toString();
    } catch {
      return `${url}${url.includes('?') ? '&' : '?'}format=${PHOTO_WIDTH}`;
    }
  });
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

  const photos = squarespacePhotoUrls(item);

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
 * A Squarespace site often splits the shop across collections (`/rolex`,
 * `/under350`) and points `dealers.website` at the homepage. The homepage is a
 * page, not a feed. Reading it as the whole catalogue retired all 85 Cool
 * Vintage Watches listings on 8 Nov 2026.
 *
 * These slugs are pages or not watches. `pocket-watches` stays.
 */
const SKIP_COLLECTION =
  /^(?:cameras?|gift-cards?|blogs?(?:-.+)?|news|testimonials?|services?|terms|about|contacts?|search(?:page)?)$/i;

/** Parent paths that hold product URLs, dropping pages and the camera shelf. */
export function squarespaceCollectionPaths(locs: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of locs) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || SKIP_COLLECTION.test(parts[0])) continue;
    const collection = `${url.origin}/${parts[0]}`;
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
  }
  return [...counts.keys()];
}

export type SquarespaceIO = {
  fetchJson?: (url: URL) => Promise<Json | null>;
  fetchText?: (url: URL, accept: string) => Promise<TextResponse | null>;
};

function locsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function isProductCollection(body: Json | null): boolean {
  if (!body) return false;
  if (Array.isArray(body.items) || body.item) return true;
  return body.collection?.typeName === 'products';
}

/**
 * Squarespace answers any collection or product URL with JSON when asked, which
 * hands us titles, prose, prices and full image galleries as data. Scraping the
 * rendered page instead means parsing five megabytes of markup to recover facts
 * the site was willing to state outright.
 *
 * Returns null when the URL is not a Squarespace collection and the sitemap
 * has no product collections either, so the caller can fall back to the scrape.
 * That fallback must not be treated as a finished catalogue.
 */
export async function fetchSquarespaceItems(
  sourceUrl: string,
  limit: number,
  minPhotos = 0,
  io: SquarespaceIO = {}
): Promise<AdapterRead | null> {
  const base = new URL(sourceUrl);
  const load = io.fetchJson ?? fetchJson;
  const firstUrl = new URL(base.toString());
  firstUrl.searchParams.set('format', 'json');
  const first = await load(firstUrl);
  if (!first) return null;

  const targets = isProductCollection(first)
    ? [base]
    : await discoverCollections(base, load, io.fetchText ?? fetchText);
  if (!targets) return null;

  const read: AdapterRead = { items: [], skipped: [], recognized: true, complete: true };
  const seen = new Set<string>();
  for (const target of targets) {
    const finished = await readCollection(target, limit, minPhotos, read, seen, load);
    if (!finished) read.complete = false;
    if (read.items.length >= limit) {
      read.complete = false;
      break;
    }
  }
  return read;
}

async function discoverCollections(
  base: URL,
  load: (url: URL) => Promise<Json | null>,
  fetchBody: (url: URL, accept: string) => Promise<TextResponse | null>
): Promise<URL[] | null> {
  const sitemapUrl = new URL('/sitemap.xml', base.origin);
  const sitemap = await fetchBody(sitemapUrl, 'application/xml');
  if (!sitemap || sitemap.status < 200 || sitemap.status >= 300) return null;
  const candidates = squarespaceCollectionPaths(locsFromSitemap(sitemap.body));
  const found: URL[] = [];
  for (const candidate of candidates) {
    const url = new URL(candidate);
    url.searchParams.set('format', 'json');
    const body = await load(url);
    if (body?.collection?.typeName === 'products' || Array.isArray(body?.items)) {
      url.searchParams.delete('format');
      found.push(url);
    }
  }
  return found.length ? found : null;
}

/**
 * True when the collection ended. False when a page failed or the item cap
 * stopped the walk, both of which must not retire what this read did not see.
 */
async function readCollection(
  base: URL,
  limit: number,
  minPhotos: number,
  read: AdapterRead,
  seen: Set<string>,
  load: (url: URL) => Promise<Json | null>
): Promise<boolean> {
  let offset: number | null = null;

  while (read.items.length < limit) {
    const page = new URL(base.toString());
    page.searchParams.set('format', 'json');
    if (offset !== null) page.searchParams.set('offset', String(offset));

    const body = await load(page);
    if (!body) return false;

    const batch = Array.isArray(body.items) ? body.items : body.item ? [body.item] : null;
    if (!batch) return false;

    for (const raw of batch) {
      const mapped = mapItem(raw, base);
      if (!mapped) {
        read.skipped.push({
          sourceUrl: typeof raw?.fullUrl === 'string' ? raw.fullUrl : base.toString(),
          title: typeof raw?.title === 'string' ? raw.title : '',
          reason: typeof raw?.title === 'string' && raw.title.trim() ? 'no photograph' : 'no title',
          meta: null,
        });
      } else if (seen.has(mapped.externalId)) {
        continue;
      } else if (!mapped.holdReason && mapped.photoUrls.length < minPhotos) {
        seen.add(mapped.externalId);
        read.skipped.push({
          sourceUrl: mapped.sourceUrl,
          title: mapped.title,
          reason: `${mapped.photoUrls.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
          meta: mapped.meta ?? null,
        });
      } else {
        seen.add(mapped.externalId);
        read.items.push(mapped);
      }

      if (read.items.length >= limit) return false;
    }

    const next = body.pagination?.nextPageOffset;
    if (!body.pagination?.nextPage || typeof next !== 'number' || next === offset) return true;
    offset = next;
  }

  return false;
}
