/**
 * Works out where a dealer keeps their watches, given nothing but a domain.
 *
 * This used to run in the CLI, where the only caller was a terminal on one
 * laptop. The operator UI needs the same answer and a browser cannot ask for
 * it: reading another origin's sitemap is exactly what CORS forbids. Rather
 * than keep a second copy in the browser that would drift from this one, it
 * moved here and the CLI now calls it too.
 *
 * Nothing here needs a secret. It is in the import function because that is
 * where outbound reads of shops we do not own are already metered and guarded.
 */

import { TIMEOUT } from '../_shared/timeouts.ts';

const USER_AGENT = 'GrahamBot/0.1 (+https://graham.app)';

/**
 * Hosts that are not on the open internet.
 *
 * On a laptop this was a non-issue. Here it is the difference between reading a
 * shop's sitemap and reading the cluster's own metadata service: a sitemap is a
 * file the shop controls, and it can name any URL it likes.
 */
const PRIVATE_HOST =
  /^(localhost$|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1|\[?fc|\[?fd|.*\.local$|.*\.internal$)/i;

export function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return !PRIVATE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeDomain(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const origin = new URL(withScheme).origin;

  if (!isPublicHttpUrl(origin)) throw new Error('That host cannot be imported.');
  return origin;
}

async function get(url: string): Promise<string | null> {
  // Every caller below passes a URL taken from a sitemap the shop wrote, so
  // the check belongs here rather than at each call site.
  if (!isPublicHttpUrl(url)) return null;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT.source),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function getJson(url: string): Promise<any> {
  const text = await get(url);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The registrable tail, so www.x.com and shop.x.com count as the same site. */
function sameSite(a: string, b: string): boolean {
  const tail = (host: string) => host.replace(/^www\./, '').split('.').slice(-2).join('.');
  return tail(a) === tail(b);
}

async function sitemapUrls(origin: string): Promise<string[]> {
  let xml = await get(`${origin}/sitemap.xml`);
  if (!xml) return [];

  // A sitemap index points at more sitemaps rather than listing pages itself.
  const indexes = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (indexes.length) {
    const parts = await Promise.all(indexes.slice(0, 8).map(get));
    xml = parts.filter(Boolean).join('');
  }

  // Filtered to the shop's own site here, once, so no later step can be walked
  // off the domain by a sitemap entry.
  const host = new URL(origin).hostname;
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((raw) => {
      try {
        return isPublicHttpUrl(raw) && sameSite(new URL(raw).hostname, host);
      } catch {
        return false;
      }
    });
}

/** Sites disagree with themselves about www; the sitemap states what they use. */
function effectiveOrigin(urls: string[], fallback: string): string {
  for (const raw of urls) {
    try {
      return new URL(raw).origin;
    } catch {
      continue;
    }
  }
  return fallback;
}

/**
 * Product pages vastly outnumber every other kind of page on a dealer's site, so
 * the directory holding the most URLs is the catalog.
 */
function catalogPath(urls: string[], origin: string): { path: string; count: number } | null {
  const counts = new Map<string, number>();

  for (const raw of urls) {
    let path: string[];
    try {
      const url = new URL(raw);
      if (url.origin !== origin) continue;
      path = url.pathname.split('/').filter(Boolean);
    } catch {
      continue;
    }
    if (path.length < 2) continue;

    const parent = `/${path.slice(0, -1).join('/')}`;
    counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }

  const [best] = [...counts].sort((a, b) => b[1] - a[1]);
  if (!best) return null;

  // Squarespace nests products under the collection as /<collection>/p/<slug>.
  // The importable URL is the collection, not the /p container.
  const [path, count] = best;
  return { path: path.replace(/\/p$/, ''), count };
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#39;': "'",
  '&apos;': "'",
  '&quot;': '"',
  '&nbsp;': ' ',
};

function decode(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(ENTITIES)) out = out.split(entity).join(char);
  return out.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// A page title of "Home" or "Shop" names the page, not the business.
const GENERIC_TITLE = /^(home|shop|store|watches|index|welcome)$/i;

async function shopName(origin: string): Promise<string | null> {
  const meta = await getJson(`${origin}/meta.json`);
  if (typeof meta?.name === 'string' && meta.name.trim()) return decode(meta.name.trim());

  const html = await get(origin);
  if (!html) return null;

  const candidates = [
    // Titles are usually "Shop Name — tagline". Keep the part before the dash.
    // Preferred over og:site_name, which shops often truncate: Goldfinger's
    // Vintage publishes just "Goldfinger" there.
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.split(/\s[|\u2013\u2014-]\s/)[0],
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1],
  ];

  for (const candidate of candidates) {
    const name = decode(candidate ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (name && !GENERIC_TITLE.test(name)) return name;
  }

  return null;
}

// Tracking pixels, image filenames and vendor addresses all look like emails.
const EMAIL_NOISE =
  /(sentry|wixpress|example|godaddy|squarespace|shopify|\.png|\.jpg|\.gif|\.webp|@2x|domain\.com|yourdomain|email\.com)/i;

const CONTACT_PATHS = ['/contact', '/pages/contact', '/contact-us', '/pages/contact-us', '/about'];

// Craft + Tailored publish their address on the terms page and nowhere else, so
// guessing paths is not enough — ask the sitemap which pages exist.
const CONTACT_LIKE = /contact|about|terms|policies|faq|imprint|inquiry|enquiry|legal/i;
const MAX_CONTACT_PAGES = 8;

function emailsIn(html: string | null): string[] {
  if (!html) return [];

  const found = [
    // A mailto is a stated intention to be written to; loose text is a guess.
    ...[...html.matchAll(/mailto:([^"'?>\s]+@[^"'?>\s]+)/gi)].map((m) => m[1]),
    ...[...html.matchAll(/"email"\s*:\s*"([^"]+@[^"]+)"/gi)].map((m) => m[1]),
    ...[...html.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g)].map((m) => m[0]),
  ];

  return found
    .map((email) => decode(email).trim().toLowerCase().replace(/[.,;:]+$/, ''))
    .filter((email) => email.includes('@') && !EMAIL_NOISE.test(email));
}

/** Prefers an address on the dealer's own domain over a gmail in their footer. */
function bestEmail(emails: string[], origin: string): string | null {
  if (!emails.length) return null;

  const host = new URL(origin).hostname.replace(/^www\./, '');
  const ranked = [...new Set(emails)].sort((a, b) => {
    const onDomain = (email: string) => (email.endsWith(`@${host}`) ? 0 : 1);
    const named = (email: string) =>
      /^(info|contact|sales|hello|enquir|inquir)/.test(email) ? 0 : 1;
    return onDomain(a) - onDomain(b) || named(a) - named(b);
  });

  return ranked[0];
}

async function contactEmail(origin: string, urls: string[]): Promise<string | null> {
  const fromSitemap = urls.filter((url) => CONTACT_LIKE.test(url)).slice(0, MAX_CONTACT_PAGES);
  const candidates = [
    ...new Set([origin, ...CONTACT_PATHS.map((path) => `${origin}${path}`), ...fromSitemap]),
  ];

  const pages = await Promise.all(candidates.map(get));
  return bestEmail(pages.flatMap(emailsIn), origin);
}

async function platform(origin: string, catalogUrl: string): Promise<string> {
  const shopify = await getJson(`${origin}/products.json?limit=1`);
  if (Array.isArray(shopify?.products)) return 'shopify';

  const squarespace = await getJson(`${catalogUrl}?format=json`);
  if (Array.isArray(squarespace?.items) || squarespace?.item) return 'squarespace';

  return 'generic';
}

export type Discovery = {
  origin: string;
  name: string;
  email: string | null;
  catalogUrl: string;
  productCount: number;
  platform: string;
  sawSitemap: boolean;
};

export async function discover(input: string): Promise<Discovery> {
  const requested = normalizeDomain(input);
  const urls = await sitemapUrls(requested);

  // The sitemap may state a different www preference, but only for the site we
  // asked about. sitemapUrls has already dropped anything off-site, so this can
  // no longer be pointed elsewhere.
  const origin = effectiveOrigin(urls, requested);
  const catalog = catalogPath(urls, origin);
  const catalogUrl = catalog ? `${origin}${catalog.path}` : origin;

  const [name, detected, email] = await Promise.all([
    shopName(origin),
    platform(origin, catalogUrl),
    contactEmail(origin, urls),
  ]);

  return {
    origin,
    name: name ?? new URL(origin).hostname.replace(/^www\./, ''),
    email,
    catalogUrl,
    productCount: catalog?.count ?? 0,
    platform: detected,
    sawSitemap: urls.length > 0,
  };
}
