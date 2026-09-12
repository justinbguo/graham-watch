/**
 * Works out where a dealer keeps their watches, given nothing but a domain.
 *
 * This runs in the CLI rather than the edge function on purpose: it needs no
 * secrets, and the operator needs to see and override what it guessed.
 */

const USER_AGENT = 'GrahamBot/0.1 (+https://graham.app)';
const TIMEOUT_MS = 15_000;

async function get(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

async function getJson(url) {
  const text = await get(url);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function normalizeDomain(input) {
  const withScheme = input.startsWith('http') ? input : `https://${input}`;
  return new URL(withScheme).origin;
}

async function sitemapUrls(origin) {
  let xml = await get(`${origin}/sitemap.xml`);
  if (!xml) return [];

  // A sitemap index points at more sitemaps rather than listing pages itself.
  const indexes = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (indexes.length) {
    const parts = await Promise.all(indexes.slice(0, 8).map(get));
    xml = parts.filter(Boolean).join('');
  }

  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/**
 * Product pages vastly outnumber every other kind of page on a dealer's site, so
 * the directory holding the most URLs is the catalog.
 */
/** Sites disagree with themselves about www; the sitemap states what they use. */
function effectiveOrigin(urls, fallback) {
  for (const raw of urls) {
    try {
      return new URL(raw).origin;
    } catch {
      continue;
    }
  }
  return fallback;
}

function catalogPath(urls, origin) {
  const counts = new Map();

  for (const raw of urls) {
    let path;
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

const ENTITIES = { '&amp;': '&', '&#39;': "'", '&apos;': "'", '&quot;': '"', '&nbsp;': ' ' };

function decode(text) {
  let out = text;
  for (const [entity, char] of Object.entries(ENTITIES)) out = out.split(entity).join(char);
  return out.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// A page title of "Home" or "Shop" names the page, not the business.
const GENERIC_TITLE = /^(home|shop|store|watches|index|welcome)$/i;

async function shopName(origin) {
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

async function platform(origin, catalogUrl) {
  const shopify = await getJson(`${origin}/products.json?limit=1`);
  if (Array.isArray(shopify?.products)) return 'shopify';

  const squarespace = await getJson(`${catalogUrl}?format=json`);
  if (Array.isArray(squarespace?.items) || squarespace?.item) return 'squarespace';

  return 'generic';
}

export async function discover(input) {
  const requested = normalizeDomain(input);
  const urls = await sitemapUrls(requested);
  const origin = effectiveOrigin(urls, requested);
  const catalog = catalogPath(urls, origin);
  const catalogUrl = catalog ? `${origin}${catalog.path}` : origin;

  const [name, detected] = await Promise.all([shopName(origin), platform(origin, catalogUrl)]);

  return {
    origin,
    name: name ?? new URL(origin).hostname.replace(/^www\./, ''),
    catalogUrl,
    productCount: catalog?.count ?? 0,
    platform: detected,
    sawSitemap: urls.length > 0,
  };
}
