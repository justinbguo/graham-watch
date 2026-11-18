import { classifyCatalogueItem } from './nonwatch.ts';
import { htmlToText } from './scrape.ts';
import {
  assertCrawlDelay,
  CatalogueRefused,
  createPacer,
  policyFromRobotsResponse,
  type RobotsPolicy,
} from './robots.ts';
import {
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

/** `?format=json` calls it priceMoney. The page's data-context calls it price. */
function moneyOf(container: Json): Json | null {
  if (!container || typeof container !== 'object') return null;
  if (container.onSale === true) {
    const sale = container.salePriceMoney ?? container.salePrice;
    if (toCents(sale) !== null) return sale;
  }
  if (container.priceMoney && typeof container.priceMoney === 'object') return container.priceMoney;
  if (container.price && typeof container.price === 'object' && 'value' in container.price) {
    return container.price;
  }
  return null;
}

function squarespaceVariants(item: Json): Json[] {
  if (Array.isArray(item?.variants)) return item.variants;
  if (Array.isArray(item?.structuredContent?.variants)) return item.structuredContent.variants;
  return [];
}

function variantInStock(variant: Json): boolean {
  return variant?.unlimited === true || Number(variant?.qtyInStock) > 0 || variant?.soldOut === false;
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
  const variants = squarespaceVariants(item);
  const available = variants.find((variant) => variantInStock(variant));

  const containers = [item?.structuredContent, available, ...variants, item];
  for (const container of containers) {
    const money = moneyOf(container);
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
  const fromItems = Array.isArray(item?.items) ? item.items : [];
  const fromImages = Array.isArray(item?.images) ? item.images : [];
  const gallery = [...fromItems, ...fromImages];
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
  // the only place a Squarespace shop admits the watch is gone. data-context
  // also sets soldOut on the product itself.
  const variants = squarespaceVariants(item);
  const price = squarespacePrice(item);
  const meta = metaOf(item, photos.length);
  const text = htmlToText(
    `${item?.excerpt ?? ''}\n${item?.body ?? ''}\n${item?.description ?? ''}`,
    sourceUrl,
  );
  const decision = classifyCatalogueItem({
    title,
    text,
    productType: meta.productType,
    tags: meta.tags ?? [],
    vendor: meta.vendor,
    sourceUrl,
  });
  if (!photos.length && decision.decision !== 'hold') return null;

  return {
    // Squarespace's own item id survives a slug rename; fullUrl does not.
    externalId: item?.id ? `squarespace:${item.id}` : productKey(sourceUrl),
    available: item?.soldOut === true
      ? false
      : variants.length === 0 || variants.some((variant) => variantInStock(variant)),
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
 *
 * Cool Vintage's grid has one image. The product page slideshow has the rest.
 * A short read must not win: `merge` keeps the longer list.
 */
export async function hydrateSquarespaceItem(
  item: SourceItem,
  io: SquarespaceIO = {},
): Promise<SourceItem> {
  const url = new URL(item.sourceUrl);
  const fetchBody = io.fetchText ?? fetchText;
  const pause = io.pause ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const policy = await policyFor(url.origin, fetchBody, pause, io.fetchText == null);
  if (!policy.allows(url)) return item;
  const take = createPacer({
    crawlDelayMs: policy.crawlDelayMs,
    floorMs: PAUSE_MS,
    budgetMs: io.budgetMs,
    pause,
  });
  if (!(await take())) return item;
  const response = await fetchBody(url, 'text/html');
  const product = response && response.status >= 200 && response.status < 300
    ? mapItem(galleryRecord(response.body), url)
    : null;
  return merge(item, product);
}

// One robots read per shop per isolate. Publish hydrates a handful of watches
// in a row; fetching robots.txt before each of them would double the requests.
const policyCache = new Map<string, RobotsPolicy>();

async function policyFor(
  origin: string,
  fetchBody: (url: URL, accept: string) => Promise<TextResponse | null>,
  pause: (ms: number) => Promise<void>,
  cache: boolean,
) {
  if (cache) {
    const hit = policyCache.get(origin);
    if (hit) return hit;
  }
  const policy = await loadPolicy(origin, fetchBody, pause);
  assertCrawlDelay(policy.crawlDelayMs);
  if (cache) policyCache.set(origin, policy);
  return policy;
}

/**
 * A Squarespace site often splits the shop across collections (`/rolex`,
 * `/under350`) and points `dealers.website` at the homepage. The homepage is a
 * page, not a feed. Reading it as the whole catalogue retired all 85 Cool
 * Vintage Watches listings on 8 Nov 2026.
 */
const KEPT_COLLECTION = /^(?:pocket-watches)$/i;
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
    if (parts.length < 2) continue;
    if (!KEPT_COLLECTION.test(parts[0]) && SKIP_COLLECTION.test(parts[0])) continue;
    const collection = `${url.origin}/${parts[0]}`;
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
  }
  return [...counts.keys()];
}

const PAUSE_MS = 1_000;

export type SquarespaceIO = {
  fetchText?: (url: URL, accept: string) => Promise<TextResponse | null>;
  pause?: (ms: number) => Promise<void>;
  startPage?: number;
  maxPages?: number;
  budgetMs?: number;
};

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Product records Squarespace embeds in the HTML. `?format=json` is disallowed. */
export function squarespaceRecords(html: string): Json[] {
  const records: Json[] = [];
  const needle = 'data-context="';
  let from = 0;
  while (from < html.length) {
    const start = html.indexOf(needle, from);
    if (start < 0) break;
    const valueStart = start + needle.length;
    const valueEnd = html.indexOf('"', valueStart);
    if (valueEnd < 0) break;
    from = valueEnd + 1;
    try {
      const parsed = JSON.parse(decodeAttribute(html.slice(valueStart, valueEnd)));
      if (parsed && typeof parsed === 'object') records.push(parsed);
    } catch {
      // A truncated attribute is not a catalogue.
    }
  }
  return records;
}

function productRecord(html: string): Json | null {
  for (const record of squarespaceRecords(html)) {
    if (record.product?.title) return record.product;
  }
  return null;
}

function collectionItems(html: string): Json[] {
  const items: Json[] = [];
  for (const record of squarespaceRecords(html)) {
    if (!Array.isArray(record.items)) continue;
    for (const item of record.items) {
      if (item && typeof item === 'object' && item.title) items.push(item);
    }
  }
  if (items.length) return items;
  // Squarespace 7.0 (Cool Vintage) prints the grid as HTML. It has no
  // data-context, and ?format=json is still disallowed.
  return squarespaceProductList(html);
}

const LIST_ANCHOR = /<a\b[^>]*\bdata-item-id="([^"]+)"[^>]*>/gi;

function tagAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function decodeListText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Title, price, sold-out, and the one grid photo from a 7.0 product list. */
export function squarespaceProductList(html: string): Json[] {
  const start = html.indexOf('id="productList"');
  if (start < 0) return [];
  const end = html.indexOf('<!-- PAGINATION -->', start);
  const list = html.slice(start, end < 0 ? html.length : end);
  const currency = html.match(/"selectedCurrency":"([A-Z]{3})"/)?.[1] ?? 'USD';
  const anchors = [...list.matchAll(LIST_ANCHOR)];
  const items: Json[] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    const tag = anchor[0];
    const className = tagAttr(tag, 'class') ?? '';
    if (!className.split(/\s+/).includes('product')) continue;
    const chunk = list.slice(anchor.index ?? 0, anchors[index + 1]?.index ?? list.length);
    const title = decodeListText(chunk.match(/class="product-title">([\s\S]*?)<\/div>/)?.[1] ?? '');
    const priceText = decodeListText(chunk.match(/class="product-price">([\s\S]*?)<\/div>/)?.[1] ?? '');
    const amount = priceText.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
    const image = chunk.match(/\bdata-image="(https:[^"]+)"/)?.[1]
      ?? chunk.match(/\bdata-src="(https:[^"]+)"/)?.[1]
      ?? null;
    if (!title) continue;
    items.push({
      id: anchor[1],
      title,
      fullUrl: tagAttr(tag, 'href') ?? undefined,
      soldOut: /\bsold-out\b/.test(className),
      ...(amount
        ? { price: { currency, value: amount[1].replaceAll(',', '') } }
        : {}),
      ...(image ? { images: [{ assetUrl: image }] } : {}),
    });
  }
  return items;
}

function jsonLdTitle(name: string): string {
  const parts = name.split(' — ');
  if (parts.length >= 2 && !/\d/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join(' — ').trim();
  }
  return name.trim();
}

/**
 * Frames inside `#productSlideshow`. Cool Vintage (Squarespace 7.0) has no
 * data-context, and its JSON-LD `image` is the one grid photo. The slideshow
 * is the gallery the deck already shows.
 */
export function squarespaceSlideshowUrls(html: string): string[] {
  const start = html.indexOf('id="productSlideshow"');
  if (start < 0) return [];
  const region = html.slice(start, start + 250_000);
  const urls: string[] = [];
  const seen = new Set<string>();
  const slide = /<div class="slide"[^>]*>[\s\S]*?\bdata-image="(https:[^"]+)"/gi;
  for (const match of region.matchAll(slide)) {
    const path = match[1].split(/[?#]/)[0];
    if (seen.has(path)) continue;
    seen.add(path);
    urls.push(match[1]);
  }
  return urls;
}

function galleryRecord(html: string): Json | null {
  const record = productRecord(html) ?? jsonLdProduct(html);
  if (!record) return null;
  const slides = squarespaceSlideshowUrls(html).map((assetUrl) => ({ assetUrl }));
  if (slides.length > squarespacePhotoUrls(record).length) {
    return { ...record, images: slides };
  }
  return record;
}

function jsonLdImages(data: Json): Array<{ assetUrl: string }> {
  const raw = data?.image;
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  const images: Array<{ assetUrl: string }> = [];
  for (const entry of list) {
    const value = typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object' && typeof entry.url === 'string'
      ? entry.url
      : '';
    const asset = value.startsWith('//') ? `https:${value}` : value;
    if (asset.startsWith('http')) images.push({ assetUrl: asset });
  }
  return images;
}

/** Product JSON-LD, for a 7.0 page that has no data-context record. */
function jsonLdProduct(html: string): Json | null {
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    let data: Json;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (data?.['@type'] !== 'Product') continue;
    const offers = data.offers;
    if (!offers || typeof offers !== 'object') continue;
    const availability = typeof offers.availability === 'string' ? offers.availability : '';
    const images = jsonLdImages(data);
    const price = offers.price;
    return {
      id: typeof offers.sku === 'string' ? offers.sku : undefined,
      title: jsonLdTitle(typeof data.name === 'string' ? data.name : ''),
      fullUrl: typeof offers.url === 'string' ? offers.url : undefined,
      description: typeof data.description === 'string' ? data.description : '',
      soldOut: /OutOfStock|SoldOut|Discontinued/i.test(availability),
      ...(price != null && price !== ''
        ? {
          price: {
            currency: typeof offers.priceCurrency === 'string' ? offers.priceCurrency : 'USD',
            value: String(price),
          },
        }
        : {}),
      ...(images.length ? { images } : {}),
    };
  }
  return null;
}

function nextPageUrl(html: string, page: URL): URL | null {
  for (const record of squarespaceRecords(html)) {
    const next = record.pagination?.nextPageUrl;
    if (record.pagination?.nextPage !== true || typeof next !== 'string' || !next) continue;
    try {
      return new URL(next, page);
    } catch {
      return null;
    }
  }
  return null;
}

function looksLikeSquarespace(html: string): boolean {
  return html.includes('Static.SQUARESPACE_CONTEXT') || html.includes('data-context=');
}

function windVintageHost(url: URL): boolean {
  return url.hostname.replace(/^www\./i, '').toLowerCase() === 'windvintage.com';
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function windVintageGridUrls(html: string, base: URL): string[] {
  const heading = html.search(/<h1\b[^>]*>[\s\S]{0,120}?Watches/i);
  if (heading < 0) return [];
  const newsletter = html.search(/newsletter-form-header/i);
  const region = html.slice(heading, newsletter < 0 ? html.length : newsletter);
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const match of region.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/image-slide-anchor/i.test(tag)) continue;
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (!windVintageHost(url)) continue;
    url.protocol = base.protocol;
    url.hostname = base.hostname;
    url.port = base.port;
    url.search = '';
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (seen.has(path)) continue;
    seen.add(path);
    url.pathname = path;
    urls.push(url.toString());
  }
  return urls;
}

function windVintagePhotos(html: string): string[] {
  const seen = new Set<string>();
  const images: { assetUrl: string }[] = [];
  for (const match of html.matchAll(/\bdata-src="(https:\/\/images\.squarespace-cdn\.com\/content\/[^"]+)"/gi)) {
    const assetUrl = match[1].split(/[?#]/)[0];
    const file = decodeURIComponent(assetUrl.split('/').pop() ?? '').toLowerCase();
    if (!file || file.includes('favicon') || file.includes('logo') || seen.has(file)) continue;
    seen.add(file);
    images.push({ assetUrl });
  }
  return squarespacePhotoUrls({ images });
}

function windVintagePriceCents(html: string, button: string): number | null {
  const line = html.match(/PRICE:\s*\$([0-9][0-9,]*)/);
  const raw = line?.[1] ?? button.match(/^\$([0-9][0-9,]*)$/)?.[1];
  if (!raw) return null;
  const dollars = Number(raw.replaceAll(',', ''));
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export type WindVintageOffer =
  | { kind: 'item'; stock: 'sale' | 'pending' | 'sold'; item: SourceItem }
  | { kind: 'skip'; title: string; reason: string };

export function windVintageOffer(html: string, pageUrl: URL): WindVintageOffer {
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  let title = h1 ? plainText(h1[1]) : '';
  if (!title || /^wind vintage$/i.test(title)) {
    title = plainText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '')
      .replace(/\s+[—–-]\s+Wind Vintage\s*$/i, '')
      .trim();
  }
  const buttons = [...html.matchAll(/<a\b[^>]*\bdata-sqsp-button\b[^>]*>([\s\S]*?)<\/a>/gi)];
  const button = plainText(buttons.at(-1)?.[1] ?? '');
  const priceCents = windVintagePriceCents(html, button);
  const sku = html.match(/Item\s+(SBUXYT\d+)/)?.[1] ?? null;
  const h1End = h1?.index == null ? 0 : h1.index + h1[0].length;
  const priceAt = html.indexOf('PRICE:', h1End);
  const text = htmlToText(html.slice(h1End, priceAt >= 0 ? priceAt : html.length), pageUrl.toString());
  const stock = /^sale\s+pending\b/i.test(button)
    ? 'pending'
    : /^sold$/i.test(button)
      ? 'sold'
      : /^\$[\d,]+$/.test(button) && priceCents != null
        ? 'sale'
        : null;
  if (!stock) return { kind: 'skip', title, reason: 'no price' };

  const photoUrls = windVintagePhotos(html);
  const decision = classifyCatalogueItem({
    title,
    text,
    productType: null,
    tags: [],
    vendor: null,
    sourceUrl: pageUrl.toString(),
  });
  return {
    kind: 'item',
    stock,
    item: {
      externalId: sku ? `squarespace:${sku}` : productKey(pageUrl.toString()),
      title,
      text,
      sourceUrl: pageUrl.toString(),
      photoUrls,
      priceCents,
      currency: priceCents == null ? null : 'USD',
      available: stock === 'sale',
      meta: {
        vendor: null,
        productType: null,
        sku,
        photoCount: photoUrls.length,
        publishedAt: null,
        updatedAt: null,
      },
      ...(decision.decision === 'hold' ? { holdReason: decision.reason } : {}),
    },
  };
}

function acceptWind(
  read: AdapterRead,
  offer: WindVintageOffer,
  pageUrl: string,
  minPhotos: number,
  seen: Set<string>,
) {
  if (offer.kind === 'skip') {
    read.skipped.push({ sourceUrl: pageUrl, title: offer.title, reason: offer.reason, meta: null });
    return;
  }
  const item = offer.item;
  if (seen.has(item.externalId)) return;
  seen.add(item.externalId);
  if (!item.title) {
    read.skipped.push({ sourceUrl: pageUrl, title: '', reason: 'no title', meta: null });
    return;
  }
  if (!item.holdReason && item.photoUrls.length < minPhotos) {
    read.skipped.push({
      sourceUrl: item.sourceUrl,
      title: item.title,
      reason: `${item.photoUrls.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
      meta: item.meta ?? null,
    });
    return;
  }
  read.items.push(item);
}

async function readWindVintage(
  base: URL,
  homeHtml: string,
  limit: number,
  minPhotos: number,
  startPage: number,
  loadHtml: (url: URL) => Promise<string | null | 'budget' | 'blocked'>,
): Promise<AdapterRead> {
  const urls = windVintageGridUrls(homeHtml, base);
  const read: AdapterRead = { items: [], skipped: [], recognized: true, complete: true };
  const seen = new Set<string>();
  if (!urls.length) {
    if (!/PRICE:|data-sqsp-button/i.test(homeHtml)) {
      read.complete = false;
      return read;
    }
    acceptWind(read, windVintageOffer(homeHtml, base), base.toString(), minPhotos, seen);
    return read;
  }

  const start = Math.max(1, Math.floor(startPage));
  for (let index = start - 1; index < urls.length; index += 1) {
    if (read.items.length >= limit) {
      read.complete = false;
      read.nextPage = index + 1;
      return read;
    }
    const pageUrl = new URL(urls[index]);
    const loaded = await loadHtml(pageUrl);
    if (loaded === 'budget') {
      read.complete = false;
      read.nextPage = index + 1;
      return read;
    }
    if (loaded === 'blocked') {
      throw new CatalogueRefused(
        `robots.txt does not allow ${pageUrl.pathname}, so this catalogue was not read.`,
      );
    }
    if (typeof loaded !== 'string') {
      read.skipped.push({
        sourceUrl: pageUrl.toString(),
        title: pageUrl.toString(),
        reason: 'product page did not answer',
        meta: null,
      });
      continue;
    }
    acceptWind(read, windVintageOffer(loaded, pageUrl), pageUrl.toString(), minPhotos, seen);
  }
  return read;
}

function locsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

/**
 * Squarespace's default robots.txt disallows `?format=json`. The same product
 * record is in the HTML, on `data-context`: title, prose, price, stock, and
 * the gallery. A homepage that is not a collection still uses the sitemap to
 * find the collections, then reads those pages the same way.
 *
 * Returns null when the URL is not Squarespace, so the caller can try the
 * next adapter. A Squarespace page we cannot finish sets `complete` false.
 */
export async function fetchSquarespaceItems(
  sourceUrl: string,
  limit: number,
  minPhotos = 0,
  io: SquarespaceIO = {},
): Promise<AdapterRead | null> {
  const base = new URL(sourceUrl);
  const fetchBody = io.fetchText ?? fetchText;
  const pause = io.pause ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const policy = await loadPolicy(base.origin, fetchBody, pause);
  assertCrawlDelay(policy.crawlDelayMs);
  const take = createPacer({
    crawlDelayMs: policy.crawlDelayMs,
    floorMs: PAUSE_MS,
    budgetMs: io.budgetMs,
    pause,
  });

  const loadHtml = async (url: URL): Promise<string | null | 'budget' | 'blocked'> => {
    if (!policy.allows(url)) return 'blocked';
    if (!(await take())) return 'budget';
    const response = await fetchBody(url, 'text/html');
    if (!response || response.status < 200 || response.status >= 300) return null;
    return response.body;
  };

  const wind = windVintageHost(base);
  const firstUrl = new URL(base.toString());
  if (!wind && (io.startPage ?? 1) > 1) firstUrl.searchParams.set('offset', String(io.startPage));
  const first = await loadHtml(firstUrl);
  if (first === 'blocked') {
    throw new CatalogueRefused(
      `robots.txt does not allow ${firstUrl.pathname}, so this catalogue was not read.`,
    );
  }
  if (first === 'budget') {
    const seconds = (policy.crawlDelayMs ?? PAUSE_MS) / 1000;
    throw new CatalogueRefused(
      `robots.txt asks for a ${seconds}s pause between requests, and that pause does not fit in this catalogue read.`,
    );
  }
  if (first == null || !looksLikeSquarespace(first)) return null;
  if (wind) return readWindVintage(base, first, limit, minPhotos, io.startPage ?? 1, loadHtml);

  const read: AdapterRead = { items: [], skipped: [], recognized: true, complete: true };
  const seen = new Set<string>();
  const direct = collectionItems(first).length > 0 || productRecord(first) != null ||
    jsonLdProduct(first) != null;
  const discovered = direct
    ? { pages: [{ url: firstUrl, html: first }], complete: true }
    : await discoverCollections(base, policy, loadHtml);
  if (!discovered || (discovered.pages.length === 0 && discovered.complete)) return null;
  if (discovered.pages.length === 0) {
    read.complete = false;
    return read;
  }

  for (const target of discovered.pages) {
    const finished = await readCollection(
      target.url,
      target.html,
      limit,
      minPhotos,
      read,
      seen,
      loadHtml,
    );
    if (!finished || read.items.length >= limit) {
      read.complete = false;
      return read;
    }
  }
  if (!discovered.complete) read.complete = false;
  return read;
}

async function loadPolicy(
  origin: string,
  fetchBody: (url: URL, accept: string) => Promise<TextResponse | null>,
  pause: (ms: number) => Promise<void>,
) {
  const url = new URL('/robots.txt', origin);
  let response = await fetchBody(url, 'text/plain');
  if (!response || response.status === 429 || response.status >= 500) {
    await pause(PAUSE_MS);
    response = await fetchBody(url, 'text/plain');
  }
  if (!response) {
    throw new CatalogueRefused('Could not read robots.txt, so this catalogue was not read.');
  }
  return policyFromRobotsResponse(response.status, response.body);
}

async function discoverCollections(
  base: URL,
  policy: { allows(url: URL): boolean },
  loadHtml: (url: URL) => Promise<string | null | 'budget' | 'blocked'>,
): Promise<{ pages: { url: URL; html: string }[]; complete: boolean } | null> {
  const sitemapUrl = new URL('/sitemap.xml', base.origin);
  if (!policy.allows(sitemapUrl)) {
    throw new CatalogueRefused(
      `robots.txt does not allow ${sitemapUrl.pathname}, so this catalogue was not read.`,
    );
  }
  const sitemap = await loadHtml(sitemapUrl);
  if (sitemap === 'blocked') {
    throw new CatalogueRefused(
      `robots.txt does not allow ${sitemapUrl.pathname}, so this catalogue was not read.`,
    );
  }
  if (sitemap === 'budget' || typeof sitemap !== 'string') return { pages: [], complete: false };
  const pages: { url: URL; html: string }[] = [];
  for (const candidate of squarespaceCollectionPaths(locsFromSitemap(sitemap))) {
    const url = new URL(candidate);
    const html = await loadHtml(url);
    if (html === 'blocked') {
      throw new CatalogueRefused(
        `robots.txt does not allow ${url.pathname}, so this catalogue was not read.`,
      );
    }
    if (html === 'budget') return { pages, complete: false };
    if (typeof html !== 'string') return { pages, complete: false };
    if (collectionItems(html).length > 0) pages.push({ url, html });
  }
  return { pages, complete: true };
}

/**
 * True when the collection ended. False when a page failed, the budget ran
 * out, or the item cap stopped the walk. Those must not retire what this
 * read did not see. A later call passes `startPage` as the `offset` query
 * Squarespace put on `pagination.nextPageUrl`.
 */
async function readCollection(
  page: URL,
  firstHtml: string,
  limit: number,
  minPhotos: number,
  read: AdapterRead,
  seen: Set<string>,
  loadHtml: (url: URL) => Promise<string | null | 'budget' | 'blocked'>,
): Promise<boolean> {
  let current = page;
  let html: string | null = firstHtml;
  const seenOffsets = new Set<string>();

  while (html && read.items.length < limit) {
    const batch = collectionItems(html);
    const single = batch.length ? null : productRecord(html) ?? jsonLdProduct(html);
    const rows = batch.length ? batch : single ? [single] : [];
    if (!rows.length) return false;

    for (const raw of rows) {
      const mapped = mapItem(raw, current);
      if (!mapped) {
        read.skipped.push({
          sourceUrl: typeof raw?.fullUrl === 'string' ? raw.fullUrl : current.toString(),
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

    const next = nextPageUrl(html, current);
    if (!next || next.toString() === current.toString()) return true;
    const offset = next.searchParams.get('offset') ?? next.toString();
    if (seenOffsets.has(offset)) return true;
    seenOffsets.add(offset);
    const loaded = await loadHtml(next);
    if (loaded === 'budget') {
      const resume = Number(next.searchParams.get('offset'));
      if (Number.isInteger(resume) && resume > 1) read.nextPage = resume;
      return false;
    }
    if (typeof loaded !== 'string') return false;
    current = next;
    html = loaded;
  }

  return read.items.length < limit;
}
