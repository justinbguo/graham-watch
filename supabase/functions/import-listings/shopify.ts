import { catalogueTypeLeaf, classifyCatalogueItem } from './nonwatch.ts';
import { CatalogueRefused, parseRobots, type RobotsPolicy } from './robots.ts';
import { htmlToText } from './scrape.ts';
import {
  fetchText,
  productKey,
  type AdapterRead,
  type ItemMeta,
  type Json,
  type SkippedItem,
  type SourceItem,
  type TextResponse,
} from './source.ts';

// Shopify caps products.json at 250 per page. The page parameter still walked
// past page 10 on 28 Oct 2026: Danny's page 18 was a short last page and page
// 19 was empty, and page 11 was a different set of products from page 1.
const PAGE_SIZE = 250;

/**
 * Pages of 250, so 40 is 10,000 products. Past this the read is incomplete
 * and absence must not retire anything. The same budget is `MAX_CATALOG_ITEMS`.
 */
export const MAX_PAGES = 40;

/**
 * A second between requests to a shop we do not own. A crawl-delay in
 * robots.txt can only raise it. One second is what the readiness read used.
 */
export const SHOPIFY_PAUSE_MS = 1_000;

/**
 * Longer than this and a large shop cannot finish inside the edge function's
 * wall clock. We refuse the read rather than crawl faster than the file asks.
 */
const MAX_CRAWL_DELAY_MS = 5_000;

/**
 * Watch dealers on Shopify also sell straps, books, tools and service plans,
 * and the shop's own product_type is the only honest way to tell them apart.
 *
 * A denylist, not a list of watch words. product_type is a shop's own
 * taxonomy, not a description: Collectors Corner NY type their watches DRESS,
 * SPORT, DIVER and MILITARY/FIELD. Requiring the word "watch" kept 3 of their
 * 87 available watches and dropped the other 84 without a word.
 *
 * `merch` is Craft + Tailored's apparel type. `two piece` and `nato` are how
 * that shop types a strap (the title says "Watch Strap"; the type does not).
 * `sculpture` is what Danny's uses for objects that are not watches.
 */
const NOT_A_WATCH =
  /\b(straps?|bands?|bracelets?|buckles?|clasps?|links?|books?|magazines?|tools?|winders?|rolls?|pouch(es)?|boxes|cases?|services?|repairs?|polish\w*|parts?|movements?|dials?|crystals?|accessor\w*|sunglasses|eyewear|apparel|t-?shirts?|hats?|caps?|gift\s*cards?|signs?|posters?|prints?|art(work)?|decor|furniture|jewel\w*|rings?|cuff\s*links?|merch(andise)?|sculptures?|two[\s-]?piece|natos?)\b/i;

/**
 * A vendor that is not a brand. Prepending it makes the title the model reads
 * start with a word it will treat as the maker: "Other 1940s Elgin".
 */
const NOT_A_BRAND = new Set([
  'other',
  'others',
  'unknown',
  'unbranded',
  'generic',
  'misc',
  'miscellaneous',
  'various',
  'n a',
  'na',
  'none',
  'no brand',
]);

const PHOTO_WIDTH = 1500;

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

function tagsOf(product: Json): string[] {
  const raw = product?.tags;
  if (Array.isArray(raw)) {
    return raw
      .filter((tag: unknown): tag is string => typeof tag === 'string' && tag.trim() !== '')
      .map((tag: string) => tag.trim());
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((tag: string) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function metaOf(product: Json, photoCount: number): ItemMeta {
  return {
    vendor: text(product?.vendor),
    productType: text(product?.product_type),
    tags: tagsOf(product),
    sku: text(product?.variants?.[0]?.sku),
    photoCount,
    publishedAt: text(product?.published_at),
    updatedAt: text(product?.updated_at),
  };
}

/**
 * "Craft + Tailored", "Craft & Tailored" and "Craft and Tailored" are one
 * name. The model never sees this form; it is only for the comparison.
 */
export function foldName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\band\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A folded token is letters only ("dannys"), but the title still has the
 * apostrophe ("Danny's"). Optional apostrophes between letters cover that
 * without matching a longer word ("crafted" is not "craft").
 */
function tokenPattern(token: string): string {
  return [...token].map(escapeRegExp).join("['’`]*");
}

/** Drops a leading shop name. A title that is only the shop name stays. */
function stripShopPrefix(title: string, shopName: string): string {
  const tokens = foldName(shopName).split(' ').filter(Boolean);
  if (!tokens.length) return title;
  // "and", "&" and "+" are the same gap. foldName already removed them from
  // the shop tokens, so the title is allowed to spell the gap any of those ways.
  const gap = '(?:[^a-z0-9]+|and)+';
  const pattern = new RegExp(`^[^a-z0-9]*${tokens.map(tokenPattern).join(gap)}(?=[^a-z0-9]|$)`, 'i');
  const match = title.match(pattern);
  if (!match) return title;
  const rest = title.slice(match[0].length).replace(/^[^a-z0-9]+/, '').trim();
  return rest || title;
}

function vendorIsBrand(vendor: string, shopName: string | null): boolean {
  const folded = foldName(vendor);
  if (!folded) return false;
  if (NOT_A_BRAND.has(folded)) return false;
  if (shopName && folded === foldName(shopName)) return false;
  return true;
}

/**
 * The title the model is told carries the brand.
 *
 * Shopify's vendor is the brand on a normal row, so it is glued on when the
 * title left it out. When the vendor is the shop itself — Danny's does this
 * on a large share of rows — gluing it on makes the model read the dealer as
 * the maker. The same for a placeholder like "Other".
 */
export function catalogueTitle(title: string, vendor: string | null, shopName: string | null): string {
  const cleaned = shopName ? stripShopPrefix(title, shopName) : title;
  const brand = vendor?.trim() ?? '';
  if (!brand || !vendorIsBrand(brand, shopName)) return cleaned;
  if (cleaned.toLowerCase().includes(brand.toLowerCase())) return cleaned;
  return `${brand} ${cleaned}`;
}

/** Either the watch, or the reason this product is not one. */
export type Mapped = { item: SourceItem } | { skipped: SkippedItem };

export function mapProduct(
  product: Json,
  origin: string,
  currency: string | null,
  shopName: string | null = null
): Mapped {
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

  const body = htmlToText(String(product?.body_html ?? ''), origin);
  const decision = classifyCatalogueItem({
    title,
    text: body,
    productType: meta.productType,
    tags: meta.tags ?? [],
    vendor: meta.vendor,
    sourceUrl,
  });

  // Dealers keep sold watches published with every variant marked unavailable,
  // which is the shop saying "gone" in the only place it says it.
  const variants: Json[] = Array.isArray(product?.variants) ? product.variants : [];
  const stated = variants.filter((variant: Json) => typeof variant?.available === 'boolean');
  const available = stated.length === 0 || stated.some((variant: Json) => variant.available === true);
  const item: SourceItem = {
    // Shopify's numeric product id survives a handle rename; the handle does not.
    externalId: product?.id == null ? productKey(sourceUrl) : `shopify:${product.id}`,
    available,
    title: catalogueTitle(title, meta.vendor, shopName),
    text: body,
    sourceUrl,
    photoUrls,
    priceCents: toCents(product?.variants?.[0]),
    currency,
    meta,
  };

  if (decision.decision === 'hold') {
    return { item: { ...item, holdReason: decision.reason } };
  }

  const type = meta.productType;
  const leaf = catalogueTypeLeaf(type);
  if (leaf && NOT_A_WATCH.test(leaf)) {
    return refuse(`product type "${type}" is not a watch`);
  }
  if (!photoUrls.length) return refuse('no photograph');

  return { item };
}

/** products.json returns the whole shop; a collection URL should not. */
function productsEndpoint(url: URL): URL {
  const collection = url.pathname.match(/^\/collections\/([^/]+)/);
  return new URL(
    collection ? `/collections/${collection[1]}/products.json` : '/products.json',
    url.origin
  );
}

function pageUrl(endpoint: URL, page: number, pageSize: number): URL {
  const url = new URL(endpoint);
  url.searchParams.set('limit', String(pageSize));
  if (page > 1) url.searchParams.set('page', String(page));
  return url;
}

function productId(product: Json): string | null {
  if (product?.id != null && String(product.id)) return String(product.id);
  const handle = text(product?.handle);
  return handle ? `handle:${handle}` : null;
}

/** Network failure, a throttle, or a server error. A 404 is the shop answering. */
function transient(response: TextResponse | null): boolean {
  if (!response) return true;
  return response.status === 429 || response.status >= 500;
}

export type ShopifyIO = {
  /** Defaults to `fetchText` with GrahamBot/0.1. Tests pass a fake. */
  fetchText?: (url: URL, accept: string) => Promise<TextResponse | null>;
  /** Defaults to a real wait of `SHOPIFY_PAUSE_MS` or the crawl-delay. */
  pause?: (ms: number) => Promise<void>;
  /** Test hook. Shopify's own cap is 250; production does not set this. */
  pageSize?: number;
  /** First products.json page for this call. Defaults to 1. */
  startPage?: number;
  /** Pages to read in this call. Defaults to the whole feed, up to MAX_PAGES. */
  maxPages?: number;
};

type ShopMeta = { currency: string | null; name: string | null };

/**
 * Every Shopify store answers /products.json publicly with titles, prose, prices,
 * SKUs and full galleries. Returns null when the URL is not a Shopify store, so
 * the caller can try the next adapter.
 *
 * The walk stops when a page comes back short, which is the end of the feed.
 * Hitting the page ceiling or the kept-watch limit, or losing a page after one
 * retry, is incomplete: a later refresh must not retire watches it never saw.
 * Collection filter URLs are not used. Shopify's robots file disallows stacked
 * `filter` parameters, and a collection is merchandising, not the stock flag.
 */
export async function fetchShopifyItems(
  sourceUrl: string,
  limit: number,
  minPhotos = 0,
  io: ShopifyIO = {}
): Promise<AdapterRead | null> {
  const base = new URL(sourceUrl);
  const endpoint = productsEndpoint(base);
  const pageSize = Math.min(PAGE_SIZE, Math.max(1, io.pageSize ?? PAGE_SIZE));
  const startPage = Math.min(MAX_PAGES, Math.max(1, Math.floor(io.startPage ?? 1)));
  const budget = Math.min(MAX_PAGES, Math.max(1, Math.floor(io.maxPages ?? MAX_PAGES)));
  const lastPage = Math.min(MAX_PAGES, startPage + budget - 1);
  const fetchBody = io.fetchText ?? fetchText;
  const pause = io.pause ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const policy = await robotsPolicy(base.origin, fetchBody, pause);
  const pauseMs = Math.max(SHOPIFY_PAUSE_MS, policy.crawlDelayMs ?? 0);

  // robots.txt already went out. The next request waits, and so does each one
  // after it. The first request of a read is the only one that does not.
  let robotsSent = true;
  const pace = async () => {
    if (robotsSent) await pause(pauseMs);
    robotsSent = true;
  };

  const load = async (url: URL, accept: string): Promise<TextResponse | null> => {
    if (!policy.allows(url)) {
      throw new CatalogueRefused(`robots.txt does not allow ${url.pathname}, so this catalogue was not read.`);
    }
    await pace();
    const first = await fetchBody(url, accept);
    if (!transient(first)) return first;
    await pace();
    const second = await fetchBody(url, accept);
    return transient(second) ? null : second;
  };

  const firstUrl = pageUrl(endpoint, startPage, pageSize);
  const first = await load(firstUrl, 'application/json');
  // A 404 is "not Shopify". A feed that never answers is not permission to
  // scrape the homepage instead and call that the whole catalogue.
  if (!first) {
    throw new CatalogueRefused('The product feed did not answer, so this catalogue was not read.');
  }
  const firstJson = parseJson(first);
  if (!Array.isArray(firstJson?.products)) return null;

  const meta = await shopMeta(base.origin, policy, load);
  const read: AdapterRead = { items: [], skipped: [], recognized: true, complete: false };
  const seen = new Set<string>();
  let products: Json[] = firstJson.products;

  for (let page = startPage; page <= lastPage; page += 1) {
    const fresh = unseen(products, seen);
    // A page of ids we already stored means the page parameter stopped moving.
    // That is not the end of the shop. Calling it complete would retire the
    // watches on the pages we never reached.
    if (products.length > 0 && fresh.length === 0) {
      read.complete = false;
      return read;
    }

    let hitLimit = false;
    for (let index = 0; index < fresh.length; index += 1) {
      const mapped = mapProduct(fresh[index], base.origin, meta.currency, meta.name);
      keep(read, mapped, minPhotos);
      if (read.items.length >= limit) {
        hitLimit = true;
        const lastOnPage = index === fresh.length - 1;
        read.complete = lastOnPage && products.length < pageSize;
        return read;
      }
    }

    if (products.length === 0 || products.length < pageSize) {
      read.complete = true;
      return read;
    }
    if (page === lastPage) {
      read.complete = false;
      if (page < MAX_PAGES) read.nextPage = page + 1;
      return read;
    }

    const nextUrl = pageUrl(endpoint, page + 1, pageSize);
    const next = await load(nextUrl, 'application/json');
    const nextJson = parseJson(next);
    if (!Array.isArray(nextJson?.products)) {
      read.complete = false;
      return read;
    }
    if (nextJson.products.length === 0) {
      read.complete = true;
      return read;
    }
    products = nextJson.products;
  }

  read.complete = false;
  return read;
}

function unseen(products: Json[], seen: Set<string>): Json[] {
  const fresh: Json[] = [];
  for (const product of products) {
    const id = productId(product);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    fresh.push(product);
  }
  return fresh;
}

function keep(read: AdapterRead, mapped: Mapped, minPhotos: number) {
  if ('skipped' in mapped) {
    read.skipped.push(mapped.skipped);
    return;
  }
  if (mapped.item.holdReason) {
    read.items.push(mapped.item);
    return;
  }
  if (mapped.item.photoUrls.length < minPhotos) {
    read.skipped.push({
      sourceUrl: mapped.item.sourceUrl,
      title: mapped.item.title,
      reason: `${mapped.item.photoUrls.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
      meta: mapped.item.meta ?? null,
    });
    return;
  }
  read.items.push(mapped.item);
}

function parseJson(response: TextResponse | null): Json | null {
  if (!response || response.status < 200 || response.status >= 300) return null;
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

async function robotsPolicy(
  origin: string,
  fetchBody: (url: URL, accept: string) => Promise<TextResponse | null>,
  pause: (ms: number) => Promise<void>
): Promise<RobotsPolicy> {
  const url = new URL('/robots.txt', origin);
  let response = await fetchBody(url, 'text/plain');
  if (transient(response)) {
    await pause(SHOPIFY_PAUSE_MS);
    response = await fetchBody(url, 'text/plain');
  }
  if (!response) {
    throw new CatalogueRefused('Could not read robots.txt, so this catalogue was not read.');
  }
  // No file means the shop has no rules. Anything else we cannot parse is a
  // reason to stop: a challenge page is not permission.
  if (response.status === 404 || response.status === 410) return parseRobots('');
  if (response.status < 200 || response.status >= 300) {
    throw new CatalogueRefused(
      `robots.txt returned ${response.status}, so this catalogue was not read.`
    );
  }
  const body = response.body.trim();
  if (body && !/user-agent\s*:/i.test(body)) {
    throw new CatalogueRefused('robots.txt was not a robots file, so this catalogue was not read.');
  }
  const policy = parseRobots(response.body);
  if (policy.crawlDelayMs !== null && policy.crawlDelayMs > MAX_CRAWL_DELAY_MS) {
    const seconds = policy.crawlDelayMs / 1000;
    throw new CatalogueRefused(
      `robots.txt asks for a ${seconds}s pause between requests, which is longer than one catalogue read can wait.`
    );
  }
  return policy;
}

/** Currency and the shop's own name. Both live in meta.json, never in products.json. */
async function shopMeta(
  origin: string,
  policy: RobotsPolicy,
  load: (url: URL, accept: string) => Promise<TextResponse | null>
): Promise<ShopMeta> {
  const url = new URL('/meta.json', origin);
  if (!policy.allows(url)) return { currency: null, name: null };
  const response = await load(url, 'application/json');
  const meta = parseJson(response);
  return {
    currency: typeof meta?.currency === 'string' ? meta.currency : null,
    name: typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : null,
  };
}
