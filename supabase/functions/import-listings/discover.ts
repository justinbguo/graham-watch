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

const USER_AGENT = 'GrahamBot/0.1 (+https://graham.watch)';

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

async function shopName(origin: string, html: string | null): Promise<string | null> {
  const meta = await getJson(`${origin}/meta.json`);
  if (typeof meta?.name === 'string' && meta.name.trim()) return decode(meta.name.trim());

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

async function contactEmail(
  origin: string,
  urls: string[],
  home: string | null
): Promise<string | null> {
  const fromSitemap = urls.filter((url) => CONTACT_LIKE.test(url)).slice(0, MAX_CONTACT_PAGES);
  // The homepage is already in hand, and it is where a footer address lives.
  const candidates = [
    ...new Set([...CONTACT_PATHS.map((path) => `${origin}${path}`), ...fromSitemap]),
  ].filter((url) => url !== origin);

  const pages = await Promise.all(candidates.map(get));
  return bestEmail([home, ...pages].flatMap(emailsIn), origin);
}

/* ------------------------------------------------------------------ profile */

/**
 * What a shop says about itself, for its page in the app.
 *
 * All of it comes out of the homepage we have already downloaded to read the
 * shop's name, so none of this costs a request beyond confirming the icon
 * loads. That is the whole reason these three were chosen over a phone number
 * or an address: those needed a contact page parsed as prose, and were there
 * to find on one site in eight anyway.
 */
export type Profile = {
  description: string | null;
  instagram: string | null;
  logoUrl: string | null;
};

export const NO_PROFILE: Profile = { description: null, instagram: null, logoUrl: null };

/** Attribute order in a `<meta>` varies by platform, so match the tag first. */
function metaContent(html: string, key: 'name' | 'property', value: string): string | null {
  const wanted = new RegExp(`${key}=["']${value}["']`, 'i');

  for (const tag of html.matchAll(/<meta\s([^>]*)>/gi)) {
    if (!wanted.test(tag[1])) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag[1])?.[1];
    if (content) return content;
  }
  return null;
}

// Long enough to be a sentence about a business rather than a page label:
// "Watches", "Home page" and the shop's own name are what this rejects. Not
// higher — Watch Steez describe themselves in 35 characters and mean it.
const MIN_DESCRIPTION = 25;
const MAX_DESCRIPTION = 400;

export function descriptionIn(html: string): string | null {
  const raw =
    metaContent(html, 'name', 'description') ?? metaContent(html, 'property', 'og:description');

  const text = decode(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < MIN_DESCRIPTION) return null;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trim()}…` : text;
}

// instagram.com paths that are not an account: share widgets, and Instagram's
// own sections. Without this, a "share this" button makes every shop @p.
const NOT_A_HANDLE =
  /^(p|reel|reels|tv|stories|explore|accounts|about|legal|developer|directory|privacy)$/i;

export function instagramIn(html: string): string | null {
  for (const match of html.matchAll(
    /(?:https?:)?\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})/gi
  )) {
    if (/sharer|\/share|intent|plugins|embed/i.test(match[0])) continue;

    const handle = match[1].replace(/\.+$/, '');
    if (handle && !NOT_A_HANDLE.test(handle)) return handle;
  }
  return null;
}

/**
 * The icon the page declares, largest first.
 *
 * Not `/favicon.ico`: of eight real dealer domains, three served one. A
 * Shopify or Squarespace shop declares its icon in HTML and serves it from a
 * CDN, and reading that found six of the eight. apple-touch-icon is preferred
 * because it is 180px by convention — a bare "shortcut icon" is often 16, which
 * is a blur at the size this is shown.
 */
export function declaredIcon(html: string, origin: string): string | null {
  const icons = [...html.matchAll(/<link\s([^>]*)>/gi)]
    .map((tag) => tag[1])
    .filter((attrs) => /rel=["'][^"']*\bicon\b[^"']*["']/i.test(attrs))
    .map((attrs) => ({
      href: /href=["']([^"']+)["']/i.exec(attrs)?.[1] ?? '',
      apple: /apple-touch-icon/i.test(attrs),
      size: Number(/sizes=["'](\d+)/i.exec(attrs)?.[1] ?? 0),
    }))
    .filter((icon) => icon.href && !icon.href.startsWith('data:'))
    .sort((a, b) => Number(b.apple) - Number(a.apple) || b.size - a.size);

  for (const icon of icons) {
    try {
      const url = new URL(decode(icon.href), origin).toString();
      // https only: the app hands this to an <Image> under App Transport
      // Security, which refuses plain http and shows nothing.
      if (url.startsWith('https://') && isPublicHttpUrl(url)) return url;
    } catch {
      // A malformed href is the shop's typo. Try the next icon.
    }
  }
  return null;
}

/**
 * Confirms a URL is really a picture before we store it.
 *
 * Analog Shift declares an icon whose URL 404s, and Squarespace answers that
 * 404 with an HTML page rather than an error the fetch would reject. Stored
 * unchecked, that is a permanently broken image beside a dealer's name.
 */
async function isImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT.source),
    });
    return response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
}

export async function readProfile(origin: string, page?: string | null): Promise<Profile> {
  const html = page === undefined ? await get(origin) : page;
  if (!html) return NO_PROFILE;

  const icon = declaredIcon(html, origin);

  return {
    description: descriptionIn(html),
    instagram: instagramIn(html),
    logoUrl: icon && (await isImage(icon)) ? icon : null,
  };
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
  /**
   * Product URLs the shop's sitemap lists. Not stock, and usually nowhere near
   * it: a vintage dealer keeps every watch they ever sold published, so
   * Collectors Corner NY list 970 and offer 87. Discovery reads a sitemap and
   * nothing else, so it cannot tell which is which — `preview` can, and the
   * operator console asks for that before anyone reads this as inventory.
   */
  sitemapProducts: number;
  platform: string;
  sawSitemap: boolean;
  profile: Profile;
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

  // Read once, used three ways: the shop's name, an address in the footer, and
  // everything on its page in the app. Three callers each fetching it was the
  // shape before, and the name was the only thing kept.
  const home = await get(origin);

  const [name, detected, email, profile] = await Promise.all([
    shopName(origin, home),
    platform(origin, catalogUrl),
    contactEmail(origin, urls, home),
    readProfile(origin, home),
  ]);

  return {
    origin,
    name: name ?? new URL(origin).hostname.replace(/^www\./, ''),
    email,
    catalogUrl,
    sitemapProducts: catalog?.count ?? 0,
    platform: detected,
    sawSitemap: urls.length > 0,
    profile,
  };
}
