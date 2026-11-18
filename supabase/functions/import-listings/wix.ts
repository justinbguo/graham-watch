import { classifyCatalogueItem } from './nonwatch.ts';
import { htmlToText } from './scrape.ts';
import { assertCrawlDelay, CatalogueRefused, createPacer, policyFromRobotsResponse } from './robots.ts';
import {
  fetchText,
  type AdapterRead,
  type ItemMeta,
  type Json,
  type SourceItem,
  type TextResponse,
} from './source.ts';

const PAUSE_MS = 1_000;
const SITEMAP_PATH = '/store-products-sitemap.xml';
/** Product pages per invocation. Each one is a full HTML document. */
const BATCH = 20;

export type WixIO = {
  fetchText?: (url: URL, accept: string) => Promise<TextResponse | null>;
  pause?: (ms: number) => Promise<void>;
  /** 1-based index into the sitemap's product URLs. */
  startPage?: number;
  /** Product pages to open in this call. */
  maxPages?: number;
  budgetMs?: number;
};

function locsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].replace(/&amp;/g, '&').trim()
  );
}

function productUrls(xml: string, origin: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const loc of locsFromSitemap(xml)) {
    let url: URL;
    try {
      url = new URL(loc, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    if (!url.pathname.includes('/product-page/')) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(key);
  }
  return urls;
}

function jsonLdProducts(html: string): Json[] {
  const products: Json[] = [];
  const pattern = /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis;
  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1]);
      const nodes = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed];
      for (const node of nodes) {
        const type = node?.['@type'];
        const types = Array.isArray(type) ? type : [type];
        if (types.includes('Product')) products.push(node);
      }
    } catch {
      // A broken block is not a product.
    }
  }
  return products;
}

function photoUrls(product: Json): string[] {
  const images = Array.isArray(product?.image) ? product.image : product?.image ? [product.image] : [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    const raw = typeof image === 'string'
      ? image
      : typeof image?.contentUrl === 'string'
      ? image.contentUrl
      : typeof image?.url === 'string'
      ? image.url
      : '';
    if (!raw.startsWith('http')) continue;
    const sized = raw.replace(/\/v1\/fit\/w_\d+,h_\d+/, '/v1/fit/w_1500,h_1500');
    if (seen.has(sized)) continue;
    seen.add(sized);
    urls.push(sized);
  }
  return urls;
}

function offerOf(product: Json): Json | null {
  const offers = product?.offers;
  if (Array.isArray(offers)) return offers[0] ?? null;
  if (offers && typeof offers === 'object') return offers;
  return null;
}

function priceOf(offer: Json | null): { priceCents: number | null; currency: string | null } {
  const raw = Number(offer?.price);
  if (!Number.isFinite(raw) || raw <= 0) return { priceCents: null, currency: null };
  const currency = typeof offer?.priceCurrency === 'string' ? offer.priceCurrency : null;
  return { priceCents: Math.round(raw * 100), currency };
}

/** OutOfStock and SoldOut are not for sale. Silence is not a sold mark. */
export function wixInStock(offer: Json | null): boolean {
  const availability = typeof offer?.availability === 'string' ? offer.availability : '';
  if (/OutOfStock|SoldOut|Discontinued/i.test(availability)) return false;
  return true;
}

function mapProduct(product: Json, pageUrl: string, minPhotos: number): SourceItem | { skip: true; reason: string; title: string } {
  const title = typeof product?.name === 'string' ? product.name.trim() : '';
  if (!title) return { skip: true, reason: 'no title', title: '' };
  const offer = offerOf(product);
  const price = priceOf(offer);
  const photos = photoUrls(product);
  const description = typeof product?.description === 'string' ? product.description : '';
  const text = htmlToText(description, pageUrl);
  const available = wixInStock(offer);
  const decision = classifyCatalogueItem({
    title,
    text,
    productType: null,
    tags: [],
    vendor: null,
    sourceUrl: pageUrl,
  });
  if (!photos.length && decision.decision !== 'hold') {
    return { skip: true, reason: 'no photograph', title };
  }
  const meta: ItemMeta = {
    vendor: null,
    productType: null,
    sku: typeof offer?.sku === 'string' && offer.sku.trim() ? offer.sku.trim() : null,
    photoCount: photos.length,
    publishedAt: null,
    updatedAt: null,
  };
  if (!decision.decision || decision.decision === 'watch') {
    if (photos.length < minPhotos) {
      return {
        skip: true,
        reason: `${photos.length} photograph(s), under the ${minPhotos} a catalogue row needs`,
        title,
      };
    }
  }
  const slug = (() => {
    try {
      return new URL(pageUrl).pathname.split('/').filter(Boolean).pop() ?? pageUrl;
    } catch {
      return pageUrl;
    }
  })();
  return {
    externalId: `wix:${slug}`,
    title,
    text,
    sourceUrl: pageUrl,
    photoUrls: photos,
    priceCents: price.priceCents,
    currency: price.currency,
    available,
    meta,
    ...(decision.decision === 'hold' ? { holdReason: decision.reason } : {}),
  };
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

/**
 * Wix Stores publishes every product URL in one sitemap. Price, stock, and
 * the gallery are JSON-LD on the product page. Returns null when that
 * sitemap is absent, so another adapter can try.
 */
export async function fetchWixItems(
  sourceUrl: string,
  limit: number,
  minPhotos = 0,
  io: WixIO = {},
): Promise<AdapterRead | null> {
  const origin = new URL(sourceUrl).origin;
  const fetchBody = io.fetchText ?? fetchText;
  const pause = io.pause ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const policy = await loadPolicy(origin, fetchBody, pause);
  assertCrawlDelay(policy.crawlDelayMs);
  const take = createPacer({
    crawlDelayMs: policy.crawlDelayMs,
    floorMs: PAUSE_MS,
    budgetMs: io.budgetMs,
    pause,
  });
  const sitemapUrl = new URL(SITEMAP_PATH, origin);
  if (!policy.allows(sitemapUrl)) return null;
  if (!(await take())) {
    const seconds = (policy.crawlDelayMs ?? PAUSE_MS) / 1000;
    throw new CatalogueRefused(
      `robots.txt asks for a ${seconds}s pause between requests, and that pause does not fit in this catalogue read.`,
    );
  }
  const sitemap = await fetchBody(sitemapUrl, 'application/xml');
  if (!sitemap || sitemap.status === 404 || sitemap.status === 410) return null;
  if (sitemap.status < 200 || sitemap.status >= 300) return null;
  const urls = productUrls(sitemap.body, origin);
  if (!urls.length) return null;

  const start = Math.max(1, Math.floor(io.startPage ?? 1));
  const batch = Math.max(1, Math.floor(io.maxPages ?? BATCH));
  const slice = urls.slice(start - 1, start - 1 + batch);
  const read: AdapterRead = {
    items: [],
    skipped: [],
    recognized: true,
    complete: start - 1 + slice.length >= urls.length,
  };

  for (let index = 0; index < slice.length; index += 1) {
    if (read.items.length >= limit) {
      read.complete = false;
      read.nextPage = start + index;
      return read;
    }
    const page = new URL(slice[index]);
    if (!policy.allows(page)) {
      throw new CatalogueRefused(
        `robots.txt does not allow ${page.pathname}, so this catalogue was not read.`,
      );
    }
    if (!(await take())) {
      read.complete = false;
      read.nextPage = start + index;
      return read;
    }
    const response = await fetchBody(page, 'text/html');
    if (!response || response.status < 200 || response.status >= 300) {
      read.skipped.push({
        sourceUrl: page.toString(),
        title: page.toString(),
        reason: 'product page did not answer',
        meta: null,
      });
      continue;
    }
    const product = jsonLdProducts(response.body)[0];
    if (!product) {
      read.skipped.push({
        sourceUrl: page.toString(),
        title: page.toString(),
        reason: 'no product data',
        meta: null,
      });
      continue;
    }
    const mapped = mapProduct(product, page.toString(), minPhotos);
    if ('skip' in mapped) {
      read.skipped.push({
        sourceUrl: page.toString(),
        title: mapped.title || page.toString(),
        reason: mapped.reason,
        meta: null,
      });
      continue;
    }
    read.items.push(mapped);
  }

  if (start - 1 + slice.length < urls.length && read.nextPage == null && read.items.length < limit) {
    read.nextPage = start + slice.length;
    read.complete = false;
  }
  return read;
}
