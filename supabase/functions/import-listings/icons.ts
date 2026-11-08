import { isPublicHttpUrl } from './discover.ts';
import { readBoundedBytes } from './photos.ts';
import { TIMEOUT } from '../_shared/timeouts.ts';

const USER_AGENT = 'GrahamBot/0.1 (+https://graham.watch)';
const MAX_ICON_BYTES = 4_000_000;
const MAX_PROBES = 8;
const PREFERRED_SHORT_SIDE = 180;

export type IconFetch = (url: string, init?: RequestInit) => Promise<Response>;

type Candidate = { url: string; tier: number };
type Measured = Candidate & { width: number; height: number };

const IMAGE_EXT = /\.(?:avif|gif|ico|jpe?g|png|webp)$/i;

/**
 * Shopify and Squarespace hand the browser a resized derivative and keep the
 * original at the same path with the crop, width, and format transforms removed.
 */
export function recoverIconUrls(raw: string): string[] {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [raw];
  }

  const found: string[] = [];
  const shopify = url.pathname.includes('/cdn/shop/');
  const squarespace =
    url.hostname.endsWith('squarespace-cdn.com') || url.hostname.endsWith('squarespace.com');

  if (shopify || squarespace) {
    const recovered = new URL(url.toString());
    if (shopify) {
      recovered.searchParams.delete('width');
      recovered.searchParams.delete('height');
      recovered.searchParams.delete('crop');
      recovered.pathname = recovered.pathname.replace(
        /_\d+x\d+(?=\.(?:avif|gif|jpe?g|png|webp)$)/i,
        '',
      );
    }
    if (squarespace) recovered.searchParams.delete('format');
    const next = recovered.toString();
    if (next !== raw) found.push(next);
  }

  found.push(raw);
  return [...new Set(found)];
}

export function isDefaultPlatformIcon(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'assets.squarespace.com' &&
      parsed.pathname.includes('/universal/default-favicon')
    );
  } catch {
    return false;
  }
}

export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = bytes[6] + (bytes[7] << 8);
    const height = bytes[8] + (bytes[9] << 8);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2)) {
    const count = bytes[4] + (bytes[5] << 8);
    let best: { width: number; height: number } | null = null;
    for (let entry = 0; entry < count; entry += 1) {
      const offset = 6 + entry * 16;
      if (offset + 1 >= bytes.length) break;
      const width = bytes[offset] || 256;
      const height = bytes[offset + 1] || 256;
      if (!best || width * height > best.width * best.height) best = { width, height };
    }
    return best;
  }

  const webp = imageSizeWebp(bytes);
  if (webp) return webp;
  return imageSizeJpeg(bytes);
}

function imageSizeWebp(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16) return null;
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  if (ascii(bytes, 12, 4) === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (ascii(bytes, 12, 4) === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] + (bytes[22] << 8) + (bytes[23] << 16) + bytes[24] * 0x1000000;
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (ascii(bytes, 12, 4) !== 'VP8 ') return null;
  for (let index = 20; index + 7 < bytes.length; index += 1) {
    if (bytes[index] === 0x9d && bytes[index + 1] === 0x01 && bytes[index + 2] === 0x2a) {
      const width = (bytes[index + 3] + (bytes[index + 4] << 8)) & 0x3fff;
      const height = (bytes[index + 5] + (bytes[index + 6] << 8)) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
  }
  return null;
}

function imageSizeJpeg(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  while (index + 8 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = bytes[index + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      index += 2;
      continue;
    }
    const length = (bytes[index + 2] << 8) + bytes[index + 3];
    if (marker >= 0xc0 && marker <= 0xc3 && index + 8 < bytes.length) {
      const height = (bytes[index + 5] << 8) + bytes[index + 6];
      const width = (bytes[index + 7] << 8) + bytes[index + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    index += 2 + length;
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[start + index] ?? 0);
  return text;
}

function shortSide(image: { width: number; height: number }): number {
  return Math.min(image.width, image.height);
}

function ratio(image: { width: number; height: number }): number {
  return shortSide(image) / Math.max(image.width, image.height);
}

function square(image: { width: number; height: number }): boolean {
  return ratio(image) >= 0.8;
}

function resolveUrl(href: string, origin: string): string | null {
  try {
    const url = new URL(decode(href), origin).toString();
    if (!url.startsWith('https://') || !isPublicHttpUrl(url) || isDefaultPlatformIcon(url)) return null;
    return url;
  } catch {
    return null;
  }
}

function decode(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function attr(tag: string, name: string): string {
  return new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? '';
}

function pushCandidate(list: Candidate[], href: string, origin: string, tier: number) {
  const resolved = resolveUrl(href, origin);
  if (!resolved) return;
  for (const url of recoverIconUrls(resolved)) {
    if (isDefaultPlatformIcon(url) || !isPublicHttpUrl(url)) continue;
    list.push({ url, tier });
  }
}

function collect(html: string, origin: string): Candidate[] {
  const list: Candidate[] = [];
  let manifest: string | null = null;

  for (const match of html.matchAll(/<link\s([^>]*)>/gi)) {
    const tag = match[1];
    const rel = attr(tag, 'rel');
    const href = decode(attr(tag, 'href'));
    if (!href || href.startsWith('data:')) continue;
    if (/\bmanifest\b/i.test(rel)) {
      manifest ??= resolveUrl(href, origin);
      continue;
    }
    if (!/\bicon\b/i.test(rel)) continue;
    const tier = /apple-touch-icon/i.test(rel) ? 0 : 1;
    pushCandidate(list, href, origin, tier);
  }

  const host = new URL(origin).hostname.replace(/^www\./, '');
  pushCandidate(list, new URL('/favicon.ico', origin).toString(), origin, 2);

  const logo = headerLogo(html, origin);
  if (logo) pushCandidate(list, logo, origin, 3);

  const og = ogImage(html, origin);
  if (og) pushCandidate(list, og, origin, 4);

  return dedupe(list).concat(manifest ? [{ url: manifest, tier: -1 }] : []).concat([
    { url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`, tier: 5 },
    { url: `https://icons.duckduckgo.com/ip3/${host}.ico`, tier: 6 },
  ]);
}

function dedupe(list: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const candidate of list) {
    const prior = best.get(candidate.url);
    if (!prior || candidate.tier < prior.tier) best.set(candidate.url, candidate);
  }
  return [...best.values()].sort((a, b) => a.tier - b.tier);
}

function headerLogo(html: string, origin: string): string | null {
  const header = /<header\b[^>]*>([\s\S]*?)<\/header>/i.exec(html)?.[1] ?? html;
  const images = [...header.matchAll(/<img\s([^>]*)>/gi)].map((match) => match[1]);
  const pool = images.filter((tag) => /logo|wordmark|brand/i.test(tag));
  for (const tag of pool) {
    const fromSet = largest(decode(attr(tag, 'srcset')), origin);
    if (fromSet) return fromSet;
    const src = decode(attr(tag, 'src'));
    const resolved = src ? resolveUrl(src, origin) : null;
    if (resolved) return resolved;
  }
  return null;
}

function largest(srcset: string, origin: string): string | null {
  let best: { href: string; width: number } | null = null;
  for (const part of srcset.split(',')) {
    const [href, widthText] = part.trim().split(/\s+/);
    if (!href) continue;
    const width = Number((widthText ?? '').replace(/w$/i, '')) || 0;
    if (!best || width > best.width) best = { href, width };
  }
  return best ? resolveUrl(best.href, origin) : null;
}

function ogImage(html: string, origin: string): string | null {
  let content = '';
  let alt = '';
  for (const match of html.matchAll(/<meta\s([^>]*)>/gi)) {
    const tag = match[1];
    const property = attr(tag, 'property');
    if (/^og:image$/i.test(property)) content = decode(attr(tag, 'content'));
    if (/^og:image:alt$/i.test(property)) alt = decode(attr(tag, 'content'));
  }
  if (!content || !/logo|icon|favicon|monogram|brand/i.test(`${content} ${alt}`)) return null;
  return resolveUrl(content, origin);
}

async function manifestIcons(url: string, fetcher: IconFetch): Promise<Candidate[]> {
  try {
    const response = await fetcher(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT.source),
      redirect: 'follow',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return [];
    }
    const body = (await response.json()) as { icons?: { src?: string }[] };
    const list: Candidate[] = [];
    for (const icon of body.icons ?? []) {
      if (typeof icon?.src === 'string') pushCandidate(list, icon.src, url, 0);
    }
    return list;
  } catch {
    return [];
  }
}

async function probe(candidate: Candidate, fetcher: IconFetch): Promise<Measured | null> {
  if (!candidate.url.startsWith('https://') || !isPublicHttpUrl(candidate.url)) return null;
  if (isDefaultPlatformIcon(candidate.url)) return null;
  try {
    const response = await fetcher(candidate.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT.source),
      redirect: 'follow',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const finalUrl = response.url || candidate.url;
    if (!isPublicHttpUrl(finalUrl) || !finalUrl.startsWith('https://') || isDefaultPlatformIcon(finalUrl)) {
      await response.body?.cancel();
      return null;
    }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const imageType =
      type.startsWith('image/') ||
      type === 'application/octet-stream' ||
      type === '' ||
      IMAGE_EXT.test(new URL(finalUrl).pathname);
    if (!imageType) {
      await response.body?.cancel();
      return null;
    }
    const bytes = await readBoundedBytes(response, MAX_ICON_BYTES);
    const size = bytes ? imageSize(bytes) : null;
    if (!size || size.width < 8 || size.height < 8) return null;
    return { ...candidate, url: finalUrl, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

function rank(measured: Measured[]): Measured | null {
  const party = measured.filter((image) => image.tier <= 4);
  const pool = party.length ? party : measured.filter((image) => image.tier >= 5);
  if (!pool.length) return null;
  const large = pool.filter((image) => shortSide(image) >= PREFERRED_SHORT_SIDE);
  const shaped = large.length ? large : pool;
  const squares = shaped.filter(square);
  const finalists = squares.length ? squares : shaped;
  finalists.sort((a, b) => shortSide(b) - shortSide(a) || a.tier - b.tier);
  return finalists[0] ?? null;
}

function improves(next: Measured, current: Measured): boolean {
  if (worse(next, current)) return false;
  if (shortSide(next) > shortSide(current)) return true;
  return !square(current) && square(next);
}

function worse(next: Measured, current: Measured): boolean {
  if (square(current) && !square(next)) return true;
  return shortSide(next) < shortSide(current);
}

/**
 * The icon to store, or null when nothing usable was found and nothing is stored.
 *
 * A miss returns the stored https URL, decoded or not, so a refresh cannot
 * blank a dealer. A smaller find, or a wide image in place of a square one,
 * also keeps the stored URL.
 */
export async function chooseDealerIcon(input: {
  html: string;
  origin: string;
  currentUrl?: string | null;
  fetch?: IconFetch;
}): Promise<string | null> {
  const fetcher = input.fetch ?? ((url, init) => fetch(url, init));
  const gathered = collect(input.html, input.origin);
  const manifest = gathered.find((candidate) => candidate.tier === -1);
  const icons = gathered.filter((candidate) => candidate.tier >= 0 && candidate.tier <= 4);
  if (manifest) icons.unshift(...(await manifestIcons(manifest.url, fetcher)));
  const unique = dedupe(icons).slice(0, MAX_PROBES);
  const measured: Measured[] = [];
  let probes = 0;
  for (const candidate of unique) {
    if (probes >= MAX_PROBES) break;
    probes += 1;
    const image = await probe(candidate, fetcher);
    if (image && !(image.tier === 4 && ratio(image) < 0.85)) measured.push(image);
  }
  if (!measured.length) {
    for (const candidate of gathered.filter((item) => item.tier >= 5)) {
      if (probes >= MAX_PROBES) break;
      probes += 1;
      const image = await probe(candidate, fetcher);
      if (image) measured.push(image);
    }
  }

  const currentUrl = input.currentUrl && resolveUrl(input.currentUrl, input.origin);
  let current: Measured | null = null;
  if (currentUrl) {
    current =
      measured.find((image) => image.url === currentUrl) ??
      (await probe({ url: currentUrl, tier: 0 }, fetcher));
  }

  const best = rank(measured);
  if (!best) return current?.url ?? currentUrl ?? null;
  if (current && !improves(best, current)) return current.url;
  return best.url;
}
