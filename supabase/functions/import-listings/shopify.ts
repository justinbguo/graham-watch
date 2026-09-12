import { htmlToText } from './scrape.ts';
import { fetchJson, type Json, type SourceItem } from './source.ts';

// Shopify caps products.json at 250 per page. Imports are capped well below one
// page, so this loop almost never runs twice.
const PAGE_SIZE = 250;
const MAX_PAGES = 10;
const PHOTO_WIDTH = 1500;

/**
 * Watch dealers on Shopify also sell straps, books, tools and service plans. The
 * shop's own product_type is the only honest way to tell them apart — but plenty
 * of shops leave it blank, and an untyped product must not be silently dropped.
 */
const WATCH_TYPE = /watch|timepiece|wristwatch|chronograph|clock/i;

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

function mapProduct(product: Json, origin: string, currency: string | null): SourceItem | null {
  const title = typeof product?.title === 'string' ? product.title.trim() : '';
  if (!title) return null;

  const type = typeof product?.product_type === 'string' ? product.product_type.trim() : '';
  if (type && !WATCH_TYPE.test(type)) return null;

  const photoUrls = (Array.isArray(product?.images) ? product.images : [])
    .map((image: Json) => image?.src)
    .filter((src: unknown): src is string => typeof src === 'string' && src.startsWith('http'))
    .map(resize);
  if (!photoUrls.length) return null;

  const handle = typeof product?.handle === 'string' ? product.handle : null;
  if (!handle) return null;

  // Shopify puts the brand in its own field, so this is the one thing the model
  // never has to guess at.
  const vendor = typeof product?.vendor === 'string' ? product.vendor.trim() : '';

  return {
    title: vendor && !title.toLowerCase().includes(vendor.toLowerCase()) ? `${vendor} ${title}` : title,
    text: htmlToText(String(product?.body_html ?? ''), origin),
    sourceUrl: new URL(`/products/${handle}`, origin).toString(),
    photoUrls,
    priceCents: toCents(product?.variants?.[0]),
    currency,
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
): Promise<SourceItem[] | null> {
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
  const items: SourceItem[] = [];
  let products: Json[] = first.products;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    for (const product of products) {
      const mapped = mapProduct(product, base.origin, currency);
      if (mapped && mapped.photoUrls.length >= minPhotos) items.push(mapped);
      if (items.length >= limit) return items;
    }

    if (products.length < PAGE_SIZE) break;

    const url = new URL(endpoint);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('page', String(page + 1));
    const next = await fetchJson(url);
    if (!Array.isArray(next?.products) || !next.products.length) break;
    products = next.products;
  }

  return items;
}