import { classifyCatalogueItem, type HoldReason } from './nonwatch.ts';
import {
  CatalogueRefused,
  assertCrawlDelay,
  createPacer,
  policyFromRobotsResponse,
  type RobotsPolicy,
} from './robots.ts';
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

type PositiveCents = number & { readonly [positiveCentsBrand]: true };

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
  fetchText?: (url: URL, accept: string) => Promise<TextResponse | null>;
  pause?: (ms: number) => Promise<void>;
  pageSize?: number;
  startPage?: number;
  maxPages?: number;
  /** Test hook. Production uses the edge-function budget in `robots.ts`. */
  budgetMs?: number;
};

type PageBody =
  | { kind: 'array'; products: Json[] }
  | { kind: 'absent' }
  | { kind: 'failed' };

const PAGE_SIZE = 100;
const MAX_PAGES = 10_000 / PAGE_SIZE;
const PAUSE_MS = 1_000;
const PRODUCTS_PATH = '/wp-json/wc/store/v1/products';
const CATEGORIES_PATH = '/wp-json/wc/store/v1/products/categories';

const RETRY_WAITS_MS = [1_000, 2_000, 4_000] as const;
const MAX_MINOR_UNIT = 20;

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

const TITLE_STARTS_WITH_SOLD = /^\*+\s*sold\b|^sold\b/i;

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

function minorUnitsToCents(
  raw: unknown,
  minorUnit: unknown,
): PositiveCents | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  if (typeof minorUnit !== 'number' || !Number.isSafeInteger(minorUnit)) {
    return null;
  }
  if (minorUnit < 0 || minorUnit > MAX_MINOR_UNIT) return null;
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

function archive(product: ParsedWoo & { id: number }): SourceItem {
  return { ...baseItem(product), available: false };
}

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
  return TITLE_STARTS_WITH_SOLD.test(product.title.trim());
}

/**
 * The Store API's own stock flags. A sold category slug is not the only way
 * a shop marks a watch gone: Wanna Buy A Watch files thousands of them under
 * a differently named category, and Theo and Harris keeps the price up.
 */
export function wooStockClosed(raw: Json): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.is_in_stock === false) return true;
  if (raw.is_purchasable === false) return true;
  const availability = raw.stock_availability;
  const kind = typeof availability?.class === 'string' ? availability.class : '';
  const label = typeof availability?.text === 'string' ? availability.text : '';
  if (/out-?of-?stock/i.test(kind)) return true;
  if (/out of stock/i.test(label)) return true;
  return false;
}

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

  for (const rule of TITLE_SKIPS) {
    if (rule.matches(product.title)) {
      return skip(product.sourceUrl, product.title, rule.reason, meta);
    }
  }

  if (soldByShop(product) || wooStockClosed(raw)) return archive(product);
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

/** Last segment of `/product-category/<slug>/`, including a nested slug. */
export function wooCategorySlug(sourceUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
  const marker = parts.findIndex((part) => part === 'product-category' || part === 'product-cat');
  if (marker < 0 || marker === parts.length - 1) return null;
  return parts[parts.length - 1] || null;
}

function productsUrl(
  origin: string,
  page: number,
  pageSize: number,
  categoryId: number | null,
  inStockOnly: boolean,
  sorted: boolean,
): URL {
  const url = new URL(PRODUCTS_PATH, origin);
  url.searchParams.set('per_page', String(pageSize));
  url.searchParams.set('page', String(page));
  if (sorted) {
    url.searchParams.set('orderby', 'id');
    url.searchParams.set('order', 'asc');
  }
  if (inStockOnly) url.searchParams.set('stock_status', 'instock');
  if (categoryId != null) url.searchParams.set('category', String(categoryId));
  return url;
}

function productsUrlFor(
  origin: string,
  page: number,
  pageSize: number,
  categoryId: number | null,
  inStockOnly: boolean,
  policy: RobotsPolicy,
): URL {
  const sorted = productsUrl(origin, page, pageSize, categoryId, inStockOnly, true);
  if (policy.allows(sorted)) return sorted;
  const unsorted = productsUrl(origin, page, pageSize, categoryId, inStockOnly, false);
  if (policy.allows(unsorted)) return unsorted;
  throw new CatalogueRefused(
    `robots.txt does not allow ${sorted.href}, so this catalogue was not read.`,
    400,
  );
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
      return { kind: 'absent' };
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
  return policyFromRobotsResponse(response.status, response.body);
}

async function categoryIdFor(
  origin: string,
  slug: string,
  policy: RobotsPolicy,
  fetchBody: (url: URL, accept: string) => Promise<TextResponse | null>,
  pause: (ms: number) => Promise<void>,
  take: () => Promise<boolean>,
): Promise<number> {
  const url = new URL(CATEGORIES_PATH, origin);
  url.searchParams.set('slug', slug);
  if (!policy.allows(url)) {
    throw new CatalogueRefused(
      `robots.txt does not allow ${url.href}, so this catalogue was not read.`,
      400,
    );
  }
  if (!(await take())) {
    throw new CatalogueRefused(
      'The category lookup does not fit in this catalogue read.',
    );
  }
  const response = await withRetry(
    () => fetchBody(url, 'application/json'),
    pause,
  );
  let rows: Json[] = [];
  if (response && response.status >= 200 && response.status < 300) {
    try {
      const parsed = JSON.parse(response.body);
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      rows = [];
    }
  }
  const match = rows.find((row) => row?.slug === slug);
  const id = numericId(match?.id);
  if (id == null) {
    throw new CatalogueRefused(
      `WooCommerce has no category "${slug}", so this catalogue was not read.`,
    );
  }
  return id;
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
  assertCrawlDelay(policy.crawlDelayMs);
  const take = createPacer({
    crawlDelayMs: policy.crawlDelayMs,
    floorMs: PAUSE_MS,
    budgetMs: io.budgetMs,
    pause,
  });
  const slug = wooCategorySlug(sourceUrl);
  const categoryId = slug
    ? await categoryIdFor(origin, slug, policy, fetchBody, pause, take)
    : null;
  let inStockOnly = true;

  const loadPage = async (
    url: URL,
  ): Promise<PageBody | { kind: 'budget' } | { kind: 'unsupported-stock' }> => {
    if (!policy.allows(url)) {
      throw new CatalogueRefused(
        `robots.txt does not allow ${url.href}, so this catalogue was not read.`,
        400,
      );
    }
    if (!(await take())) return { kind: 'budget' };
    const response = await withRetry(
      () => fetchBody(url, 'application/json'),
      pause,
    );
    if (
      inStockOnly && response?.status === 400 &&
      url.searchParams.get('stock_status') === 'instock'
    ) {
      return { kind: 'unsupported-stock' };
    }
    return classifyPage(response);
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
    let loaded = await loadPage(
      productsUrlFor(origin, page, pageSize, categoryId, inStockOnly, policy),
    );
    if (!started && loaded.kind === 'unsupported-stock') {
      // This host's Store API does not accept stock_status. Read the page
      // as published and let wooStockClosed drop what is not for sale.
      inStockOnly = false;
      loaded = await loadPage(
        productsUrlFor(origin, page, pageSize, categoryId, false, policy),
      );
    }
    if (loaded.kind === 'budget') {
      if (!started) {
        const seconds = (policy.crawlDelayMs ?? PAUSE_MS) / 1000;
        throw new CatalogueRefused(
          `robots.txt asks for a ${seconds}s pause between requests, and that pause does not fit in this catalogue read.`,
        );
      }
      read.complete = false;
      if (page < MAX_PAGES) read.nextPage = page;
      return read;
    }
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
