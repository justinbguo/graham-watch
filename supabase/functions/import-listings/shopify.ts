import { htmlToText } from './scrape.ts';
import {
  fetchJson,
  productKey,
  type AdapterRead,
  type ItemMeta,
  type Json,
  type SkippedItem,
  type SourceItem,
} from './source.ts';

// Shopify caps products.json at 250 per page. Imports are capped well below one
// page, so this loop almost never runs twice.
const PAGE_SIZE = 250;
const MAX_PAGES = 10;
const PHOTO_WIDTH = 1500;

/**
 * Watch dealers on Shopify also sell straps, books, tools and service plans,
 * and the shop's own product_type is the only honest way to tell them apart.
 *
 * A denylist, not a list of watch words. product_type is a shop's own
 * taxonomy, not a description: Collectors Corner NY type their watches DRESS,
 * SPORT, DIVER and MILITARY/FIELD. Requiring the word "watch" kept 3 of their
 * 87 available watches and dropped the other 84 without a word.
 */
const NOT_A_WATCH =
  /\b(straps?|bands?|bracelets?|buckles?|clasps?|links?|books?|magazines?|tools?|winders?|rolls?|pouch(es)?|boxes|cases?|services?|repairs?|polish\w*|parts?|movements?|dials?|crystals?|accessor\w*|sunglasses|eyewear|apparel|t-?shirts?|hats?|caps?|gift\s*cards?|signs?|posters?|prints?|art(work)?|decor|furniture|jewel\w*|rings?|cuff\s*links?)\b/i;

function resize(src: string): string {
  try {
    const url = new URL(src);
    url.searchParams.set('width', String(PHOTO_WIDTH));
    return url.toString();
  } catch {
    return src;
  }
}

function toCents(variant: Json): number | null {
  const price = Number(variant?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metaOf(product: Json, photoCount: number): ItemMeta {
  return {
    vendor: text(product?.vendor),
    productType: text(product?.product_type),
    sku: text(product?.variants?.[0]?.sku),
    photoCount,
    publishedAt: text(product?.published_at),
    updatedAt: text(product?.updated_at),
  };
}

/** Either the watch, or the reason this product is not one. */
export type Mapped = { item: SourceItem } | { skipped: SkippedItem };

export function mapProduct(product: Json, origin: string, currency: string | null): Mapped {
  const title = text(product?.title) ?? '';
  const handle = text(product?.handle);

  const photoUrls = (Array.isArray(product?.images) ? product.images : [])
    .map((image: Json) => image?.src)
    .filter((src: unknown): src is string => typeof src === 'string' && src.startsWith('http'))
    .map(resize);

  const meta = metaOf(product, photoUrls.length);
  const sourceUrl = handle
    ? new URL(`/products/${handle}`, origin).toString()
    : new URL(origin).toString();

  const refuse = (reason: string): Mapped => ({
    skipped: { sourceUrl, title: title || (handle ?? sourceUrl), reason, meta },
  });

  if (!title) return refuse('no title');
  if (!handle) return refuse('no product URL');

  const type = meta.productType;
  // A blank type is not a claim. Dropping untyped products would empty every
  // shop that never filled the field in. "Watch Straps" is a strap, so the
  // word "watch" in a type earns nothing — the operator console lists every
  // refusal with its reason, which is what makes a wrong call here visible.
  if (type && NOT_A_WATCH.test(type)) {
    return refuse(`product type "${type}" is not a watch`);
  }
  if (!photoUrls.length) return refuse('no photograph');

  // Shopify puts the brand in its own field, so this is the one thing the model
  // never has to guess at.
  const vendor = meta.vendor ?? '';

  // Dealers keep sold watches published with every variant marked unavailable,
  // which is the shop saying "gone" in the only place it says it.
  const variants: Json[] = Array.isArray(product?.variants) ? product.variants : [];
  const stated = variants.filter((variant: Json) => typeof variant?.available === 'boolean');

  return {
    item: {
      // Shopify's numeric product id survives a handle rename; the handle does not.
      externalId: product?.id == null ? productKey(sourceUrl) : `shopify:${product.id}`,
      available: stated.length === 0 || stated.some((variant: Json) => variant.available === true),
      title:
        vendor && !title.toLowerCase().includes(vendor.toLowerCase())
          ? `${vendor} ${title}`
          : title,
      text: htmlToText(String(product?.body_html ?? ''), origin),
      sourceUrl,
      photoUrls,
      priceCents: toCents(product?.variants?.[0]),
      currency,
      meta,
    },
  };
}

/** products.json returns the whole shop; a collection URL should not. */
function productsEndpoint(url: URL): URL {
  const collection = url.pathname.match(/^\/collections\/([^/]+)/);
  return new URL(
    collection ? `/collections/${collection[1]}/products.json` : '/products.json',
    url.origin
  );
}

/** Currency is in meta.json, never in products.json. */
async function shopCurrency(origin: string): Promise<string | null> {
  const meta = await fetchJson(new URL('/meta.json', origin));
  return typeof meta?.currency === 'string' ? meta.currency : null;
}

/**
 * Every Shopify store answers /products.json publicly with titles, prose, prices,
 * SKUs and full galleries. Returns null when the URL is not a Shopify store, so
 * the caller can try the next adapter.
 */
export async function fetchShopifyItems(
  sourceUrl: string,
  limit: number,
  minPhotos = 0
): Promise<AdapterRead | null> {
  const base = new URL(sourceUrl);
  const endpoint = productsEndpoint(base);

  const first = await fetchJson(
    (() => {
      const url = new URL(endpoint);
      url.searchParams.set('limit', String(PAGE_SIZE));
      return url;
    })()
  );
  if (!Array.isArray(first?.products)) return null;

  const currency = await shopCurrency(base.origin);
  const read: AdapterRead = { items: [], skipped: [] };
  let products: Json[] = first.products;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    for (const product of products) {
      const mapped = mapProduct(product, base.origin, currency);

      if ('skipped' in mapped) {
        read.skipped.push(mapped.skipped);
      } else if (mapped.item.photoUrls.length < minPhotos) {
        read.skipped.push({
          sourceUrl: mapped.item.sourceUrl,
          title: mapped.item.title,
          reason: `${mapped.item.photoUrls.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
          meta: mapped.item.meta ?? null,
        });
      } else {
        read.items.push(mapped.item);
      }

      if (read.items.length >= limit) return read;
    }

    if (products.length < PAGE_SIZE) break;

    const url = new URL(endpoint);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('page', String(page + 1));
    const next = await fetchJson(url);
    if (!Array.isArray(next?.products) || !next.products.length) break;
    products = next.products;
  }

  return read;
}