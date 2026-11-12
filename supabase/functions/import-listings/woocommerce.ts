import { classifyCatalogueItem, type HoldReason } from './nonwatch.ts';
import { CatalogueRefused, parseRobots, type RobotsPolicy } from './robots.ts';
import { htmlToText } from './scrape.ts';
import {
  type AdapterRead,
  fetchText,
  type ItemMeta,
  type Json,
  type SkippedItem,
  type SourceItem,
  type TextResponse,
} from './source.ts';

declare const positiveCentsBrand: unique symbol;

/**
 * A cent amount a buyer can be shown. Zero is not a member.
 * `minorUnitsToCents` is the only constructor.
 */
type PositiveCents = number & { readonly [positiveCentsBrand]: true };

/**
 * What the rest of this file reads. `is_in_stock`, `stock_availability`,
 * `price_html`, `regular_price`, `sale_price`, `brands`, variations, and the
 * Link header are not fields here.
 */
type ParsedWoo = {
  id: number | null;
  title: string;
  text: string;
  sourceUrl: string | null;
  photoUrls: string[];
  priceCents: PositiveCents | null;
  currency: string | null;
  categorySlugs: string[];
  categoryNames: string[];
  tagNames: string[];
  sku: string | null;
};

type WooIO = {
  /** Defaults to `fetchText`, which sends GrahamBot/0.1. Tests pass a fake. */
  fetchText?: (url: URL, accept: string) => Promise<TextResponse | null>;
  /** Defaults to a real wait. */
  pause?: (ms: number) => Promise<void>;
  /** Store API cap is 100. Production does not set this. */
  pageSize?: number;
  /** First products page for this call. Defaults to 1. */
  startPage?: number;
  /** Pages to read in this call. Defaults to `MAX_PAGES`. */
  maxPages?: number;
};

type PageBody =
  | { kind: 'array'; products: Json[] }
  | { kind: 'absent' }
  | { kind: 'failed' };

/** Store API accepts 100. 100 pages is the 10,000 item catalogue budget. */
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const PAUSE_MS = 1_000;
const MAX_CRAWL_DELAY_MS = 5_000;
const PRODUCTS_PATH = '/wp-json/wc/store/v1/products';

/** Same URL after a dropped socket, 403, 429, or 5xx. A 404 is an answer. */
const RETRY_WAITS_MS = [1_000, 2_000, 4_000] as const;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
};

const BOOK_WORD = /\bbooks?\b/i;
const BOOKLET_WORD = /\bbooklets?\b/i;
const WITH_BOOK = /\bwith\s+books?\b/i;
const BOOK_AND_PAPERS = /\bbooks?\s+and\s+papers\b/i;
const BOX_AND_BOOK = /\bbox\s+and\s+books?\b/i;
const DISPLAY_SIGN = /\bdisplay\s+signs?\b/i;

/**
 * Optional asterisks, then the word sold, at the start of the title.
 * `**SOLD**BREGUET` matches. A title that only contains the word does not.
 */
const TITLE_SOLD = /^\*+\s*sold\b|^sold\b/i;

type TitleSkip = {
  reason: string;
  matches: (title: string) => boolean;
};

const TITLE_SKIPS: readonly TitleSkip[] = [
  { reason: 'title is a book', matches: isBookTitle },
  {
    reason: 'title is a display sign',
    matches: (title) => DISPLAY_SIGN.test(title),
  },
];

/**
 * Store API `prices.price` is a minor-unit digit string.
 * cents = digits * 10^(2 - currency_minor_unit). Unit 2 leaves "1550000" as
 * 1550000. Null for empty, zero, a fraction, or any other non-integer.
 */
function minorUnitsToCents(
  raw: unknown,
  minorUnit: unknown,
): PositiveCents | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  if (typeof minorUnit !== 'number' || !Number.isSafeInteger(minorUnit)) {
    return null;
  }
  // ISO minor units are tiny. A unit past 20 is rejected before the power is computed.
  if (minorUnit < 0 || minorUnit > 20) return null;
  const digits = BigInt(raw);
  if (digits <= 0n) return null;
  const scale = 2 - minorUnit;
  let cents: bigint;
  if (scale >= 0) {
    cents = digits * 10n ** BigInt(scale);
  } else {
    const divisor = 10n ** BigInt(-scale);
    if (digits % divisor !== 0n) return null;
    cents = digits / divisor;
  }
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(cents) as PositiveCents;
}

function fromCodePoint(match: string, code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return match;
  if (code >= 0xd800 && code <= 0xdfff) return match;
  return String.fromCodePoint(code);
}

function decodeEntities(value: string): string {
  const numeric = value
    .replace(
      /&#(\d+);/g,
      (match, digits: string) => fromCodePoint(match, Number(digits)),
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (match, hex: string) => fromCodePoint(match, Number.parseInt(hex, 16)),
    );
  let named = numeric;
  for (const [entity, char] of Object.entries(NAMED_ENTITIES)) {
    if (!named.includes(entity)) continue;
    named = named.split(entity).join(char);
  }
  return named;
}

/** Booklet stays a watch. A book that comes with a watch stays a watch. */
function isBookTitle(title: string): boolean {
  if (BOOKLET_WORD.test(title)) return false;
  if (!BOOK_WORD.test(title)) return false;
  if (
    WITH_BOOK.test(title) || BOOK_AND_PAPERS.test(title) ||
    BOX_AND_BOOK.test(title)
  ) return false;
  return true;
}

function numericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function productUrl(permalink: unknown, origin: string): string | null {
  if (typeof permalink !== 'string' || !permalink.trim()) return null;
  try {
    return new URL(permalink, origin).toString();
  } catch {
    return null;
  }
}

function photoUrlsOf(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const image of images) {
    const src = image?.src;
    if (typeof src !== 'string' || !src.startsWith('http')) continue;
    if (seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
  }
  return urls;
}

function categoryFields(
  categories: unknown,
): { slugs: string[]; names: string[] } {
  if (!Array.isArray(categories)) return { slugs: [], names: [] };
  const slugs: string[] = [];
  const names: string[] = [];
  for (const category of categories) {
    const slug = typeof category?.slug === 'string' ? category.slug.trim() : '';
    if (slug) slugs.push(slug);
    if (slug.toLowerCase() === 'sold') continue;
    const name = typeof category?.name === 'string' ? decodeEntities(category.name).trim() : '';
    if (name) names.push(name);
  }
  return { slugs, names };
}

function tagNamesOf(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const names: string[] = [];
  for (const tag of tags) {
    const name = typeof tag?.name === 'string' ? decodeEntities(tag.name).trim() : '';
    if (name) names.push(name);
  }
  return names;
}

function parseProduct(raw: Json, origin: string): ParsedWoo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const prices = raw.prices;
  const priceCents = minorUnitsToCents(
    prices?.price,
    prices?.currency_minor_unit,
  );
  const currencyCode = prices?.currency_code;
  const currency = priceCents && typeof currencyCode === 'string' && currencyCode.trim()
    ? currencyCode.trim()
    : null;
  const sourceUrl = productUrl(raw.permalink, origin);
  const description = textField(raw.description);
  const shortDescription = textField(raw.short_description);
  const html = description.trim() ? description : shortDescription;
  const pageUrl = sourceUrl ?? origin;
  const categories = categoryFields(raw.categories);
  const sku = textField(raw.sku).trim();
  return {
    id: numericId(raw.id),
    title: decodeEntities(textField(raw.name)).trim(),
    text: decodeEntities(htmlToText(html, pageUrl)),
    sourceUrl,
    photoUrls: photoUrlsOf(raw.images),
    priceCents,
    currency,
    categorySlugs: categories.slugs,
    categoryNames: categories.names,
    tagNames: tagNamesOf(raw.tags),
    sku: sku || null,
  };
}

function metaOf(product: ParsedWoo): ItemMeta {
  return {
    vendor: null,
    productType: product.categoryNames.length ? product.categoryNames.join(', ') : null,
    tags: product.tagNames,
    sku: product.sku,
    photoCount: product.photoUrls.length,
    publishedAt: null,
    updatedAt: null,
  };
}

function skip(
  sourceUrl: string,
  title: string,
  reason: string,
  meta: ItemMeta | null,
): SkippedItem {
  return { sourceUrl, title: title || sourceUrl, reason, meta };
}

function baseItem(
  product: ParsedWoo & { id: number },
): Omit<SourceItem, 'available'> {
  return {
    externalId: `woocommerce:${product.id}`,
    title: product.title,
    text: product.text,
    sourceUrl: product.sourceUrl ?? '',
    photoUrls: product.photoUrls,
    priceCents: product.priceCents,
    currency: product.currency,
    meta: metaOf(product),
  };
}

/** For sale. The price argument cannot be null or zero. */
function forSale(
  product: ParsedWoo & { id: number },
  priceCents: PositiveCents,
): SourceItem {
  return {
    ...baseItem(product),
    available: true,
    priceCents,
    currency: product.currency,
  };
}

/** The shop said sold. The price may be null. */
function archive(product: ParsedWoo & { id: number }): SourceItem {
  return { ...baseItem(product), available: false };
}

/** A strap, accessory, clock, or other non-wristwatch. The price may be null. */
function held(
  product: ParsedWoo & { id: number },
  reason: HoldReason,
): SourceItem {
  return { ...baseItem(product), available: true, holdReason: reason };
}

function soldByShop(product: ParsedWoo): boolean {
  if (product.categorySlugs.some((slug) => slug.toLowerCase() === 'sold')) {
    return true;
  }
  return TITLE_SOLD.test(product.title.trim());
}

/**
 * One Store API product. The first match wins.
 * A kept row is a listing, a hold, or a sold archive. Anything else is a skip.
 */
export function mapWooProduct(
  raw: Json,
  origin: string,
  minPhotos: number,
): SourceItem | SkippedItem {
  const parsed = parseProduct(raw, origin);
  if (!parsed) return skip(origin, '', 'no title', null);
  const meta = metaOf(parsed);
  const sourceUrl = parsed.sourceUrl ?? origin;
  if (!parsed.title) return skip(sourceUrl, '', 'no title', meta);
  if (!parsed.sourceUrl) {
    return skip(origin, parsed.title, 'no product URL', meta);
  }
  if (parsed.id == null) {
    return skip(parsed.sourceUrl, parsed.title, 'no product id', meta);
  }
  const product = parsed as ParsedWoo & { id: number; sourceUrl: string };

  const decision = classifyCatalogueItem({
    title: product.title,
    text: product.text,
    productType: product.categoryNames.length ? product.categoryNames.join(', ') : null,
    tags: product.tagNames,
    vendor: null,
    sourceUrl: product.sourceUrl,
  });
  if (decision.decision === 'hold') return held(product, decision.reason);

  // A book or a sign is not stored. A hold would stamp the listing not_a_watch,
  // and that stamp does not clear on a later read.
  for (const rule of TITLE_SKIPS) {
    if (rule.matches(product.title)) {
      return skip(product.sourceUrl, product.title, rule.reason, meta);
    }
  }

  // Sold is an archive even when the price is missing. A live row with no
  // price is a skip, so the archive check has to win first.
  if (soldByShop(product)) return archive(product);
  if (product.priceCents == null) {
    return skip(product.sourceUrl, product.title, 'no price', meta);
  }
  if (product.photoUrls.length < minPhotos) {
    return skip(
      product.sourceUrl,
      product.title,
      `${product.photoUrls.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
      meta,
    );
  }
  return forSale(product, product.priceCents);
}

function productsUrl(origin: string, page: number, pageSize: number): URL {
  const url = new URL(PRODUCTS_PATH, origin);
  url.searchParams.set('per_page', String(pageSize));
  url.searchParams.set('page', String(page));
  url.searchParams.set('orderby', 'id');
  url.searchParams.set('order', 'asc');
  return url;
}

function retryable(response: TextResponse | null): boolean {
  if (!response) return true;
  return response.status === 403 || response.status === 429 ||
    response.status >= 500;
}

async function withRetry(
  load: () => Promise<TextResponse | null>,
  pause: (ms: number) => Promise<void>,
): Promise<TextResponse | null> {
  let response = await load();
  for (const wait of RETRY_WAITS_MS) {
    if (!retryable(response)) return response;
    await pause(wait);
    response = await load();
  }
  return response;
}

function classifyPage(response: TextResponse | null): PageBody {
  if (!response) return { kind: 'failed' };
  if (response.status === 404 || response.status === 410) {
    return { kind: 'absent' };
  }
  if (response.status >= 200 && response.status < 300) {
    try {
      const parsed = JSON.parse(response.body);
      if (Array.isArray(parsed)) return { kind: 'array', products: parsed };
    } catch {
      // A 2xx body that is not JSON is not this feed.
    }
    return { kind: 'absent' };
  }
  return { kind: 'failed' };
}

function productId(raw: Json): string | null {
  const id = numericId(raw?.id);
  return id == null ? null : String(id);
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

/**
 * Not shared with Shopify. That read retries a dropped socket, 429, and 5xx.
 * A 403 is retried here as well, then the same refusals apply.
 */
async function robotsFor(
  origin: string,
  fetchBody: (url: URL, accept: string) => Promise<TextResponse | null>,
  pause: (ms: number) => Promise<void>,
): Promise<RobotsPolicy> {
  const url = new URL('/robots.txt', origin);
  let response = await fetchBody(url, 'text/plain');
  if (retryable(response)) {
    await pause(PAUSE_MS);
    response = await fetchBody(url, 'text/plain');
  }
  if (!response) {
    throw new CatalogueRefused(
      'Could not read robots.txt, so this catalogue was not read.',
    );
  }
  if (response.status === 404 || response.status === 410) {
    return parseRobots('');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CatalogueRefused(
      `robots.txt returned ${response.status}, so this catalogue was not read.`,
    );
  }
  const body = response.body.trim();
  if (body && !/user-agent\s*:/i.test(body)) {
    throw new CatalogueRefused(
      'robots.txt was not a robots file, so this catalogue was not read.',
    );
  }
  const policy = parseRobots(response.body);
  if (
    policy.crawlDelayMs !== null && policy.crawlDelayMs > MAX_CRAWL_DELAY_MS
  ) {
    const seconds = policy.crawlDelayMs / 1000;
    throw new CatalogueRefused(
      `robots.txt asks for a ${seconds}s pause between requests, which is longer than one catalogue read can wait.`,
    );
  }
  return policy;
}

/**
 * Reads the public WooCommerce Store API.
 * Returns null when the first page of this call is not a product array.
 * A feed that will not answer throws CatalogueRefused.
 */
export async function fetchWooCommerceItems(
  sourceUrl: string,
  limit: number,
  minPhotos = 0,
  io: WooIO = {},
): Promise<AdapterRead | null> {
  const origin = new URL(sourceUrl).origin;
  const pageSize = Math.min(PAGE_SIZE, Math.max(1, io.pageSize ?? PAGE_SIZE));
  const startPage = Math.min(
    MAX_PAGES,
    Math.max(1, Math.floor(io.startPage ?? 1)),
  );
  const budget = Math.min(
    MAX_PAGES,
    Math.max(1, Math.floor(io.maxPages ?? MAX_PAGES)),
  );
  const lastPage = Math.min(MAX_PAGES, startPage + budget - 1);
  const fetchBody = io.fetchText ?? fetchText;
  const pause = io.pause ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const policy = await robotsFor(origin, fetchBody, pause);
  const pauseMs = Math.max(PAUSE_MS, policy.crawlDelayMs ?? 0);

  const loadPage = async (url: URL): Promise<PageBody> => {
    if (!policy.allows(url)) {
      throw new CatalogueRefused(
        `robots.txt does not allow ${url.pathname}, so this catalogue was not read.`,
      );
    }
    await pause(pauseMs);
    return classifyPage(
      await withRetry(() => fetchBody(url, 'application/json'), pause),
    );
  };

  const read: AdapterRead = {
    items: [],
    skipped: [],
    recognized: true,
    complete: false,
  };
  const seen = new Set<string>();
  let started = false;

  for (let page = startPage; page <= lastPage; page += 1) {
    const loaded = await loadPage(productsUrl(origin, page, pageSize));
    if (loaded.kind !== 'array') {
      if (!started) {
        if (loaded.kind === 'absent') return null;
        throw new CatalogueRefused(
          'The product feed did not answer, so this catalogue was not read.',
        );
      }
      read.complete = false;
      return read;
    }

    started = true;
    const products = loaded.products;
    const fresh = unseen(products, seen);
    if (products.length > 0 && fresh.length === 0) {
      read.complete = false;
      return read;
    }

    for (let index = 0; index < fresh.length; index += 1) {
      const mapped = mapWooProduct(fresh[index], origin, minPhotos);
      if ('reason' in mapped) read.skipped.push(mapped);
      else read.items.push(mapped);
      if (read.items.length >= limit) {
        const lastOnPage = index === fresh.length - 1;
        read.complete = lastOnPage && products.length < pageSize;
        return read;
      }
    }

    if (products.length < pageSize) {
      read.complete = true;
      return read;
    }
    if (page === lastPage) {
      read.complete = false;
      if (page < MAX_PAGES) read.nextPage = page + 1;
      return read;
    }
  }

  read.complete = false;
  return read;
}
