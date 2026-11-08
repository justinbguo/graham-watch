import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { TIMEOUT } from '../_shared/timeouts.ts';

const BUCKET = 'listing-photos';
const MAX_BYTES = 8 * 1024 * 1024;

// One photograph in memory at a time. The publish pool runs several watches
// at once, and each file is allowed to be 8MB. Holding those together is how
// a refresh crosses the isolate's 256MB and dies with HTTP 546.
const PHOTO_COPIES_AT_ONCE = 1;
let photosActive = 0;
const photoWaiters: Array<() => void> = [];

function acquirePhoto(): Promise<void> {
  if (photosActive < PHOTO_COPIES_AT_ONCE) {
    photosActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    photoWaiters.push(() => {
      photosActive += 1;
      resolve();
    });
  });
}

function releasePhoto() {
  photosActive -= 1;
  const resume = photoWaiters.shift();
  if (resume) resume();
}

/**
 * The bytes of one response, or null when they would pass `maxBytes`.
 *
 * `arrayBuffer()` is the wrong call here: a gallery file with no
 * Content-Length is buffered whole before we can refuse it, and a shop CDN
 * will happily hand us a 40MB original. Reading until the cap, then
 * cancelling, is what keeps a single photograph inside the isolate's 256MB.
 */
export async function readBoundedBytes(
  response: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised > maxBytes) {
    await response.body?.cancel();
    return null;
  }

  const body = response.body;
  if (!body) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (total + value.byteLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Squarespace's no-image PNG. HTTP 200, 300×300, 2102 bytes. Not a photograph. */
export const SQUARESPACE_PLACEHOLDER_SHA256 =
  '581af6bf6f105c917c6e7085911bae110d5326a72dd728499c14566f6e8b1269';

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function isPlaceholderPhoto(bytes: Uint8Array): Promise<boolean> {
  return (await sha256Hex(bytes)) === SQUARESPACE_PLACEHOLDER_SHA256;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export type CopiedPhoto = {
  source_url: string;
  storage_path: string | null;
  position: number;
};

/**
 * Copies one photo into storage and returns the row to insert. A failed copy
 * leaves storage_path null and the reader falls back to the dealer's own URL: a
 * hot-linked photo is worth far more than a failed import.
 */
async function copyOne(
  admin: SupabaseClient,
  listingId: string,
  sourceUrl: string,
  position: number
): Promise<CopiedPhoto | null> {
  const fallback = { source_url: sourceUrl, storage_path: null, position };

  await acquirePhoto();
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'GrahamBot/0.1 (+https://graham.watch)' },
      signal: AbortSignal.timeout(TIMEOUT.photo),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return fallback;
    }

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    const extension = EXTENSIONS[contentType];
    // Dealer pages link to plenty of things that are not photographs.
    if (!extension) {
      await response.body?.cancel();
      return fallback;
    }

    const bytes = await readBoundedBytes(response, MAX_BYTES);
    if (!bytes?.byteLength) return fallback;
    // The placeholder is a successful response. Leaving a hotlink would still
    // paint the grey tile, so the row is omitted and the gallery shifts up.
    if (await isPlaceholderPhoto(bytes)) return null;

    const path = `${listingId}/${position}.${extension}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (error) return fallback;

    return { source_url: sourceUrl, storage_path: path, position };
  } catch {
    return fallback;
  } finally {
    releasePhoto();
  }
}

/**
 * One file at a time. A placeholder is omitted, and the next real photograph
 * takes the position it left, so the kept set is what the minimum counts.
 */
export async function copyPhotos(
  admin: SupabaseClient,
  listingId: string,
  sourceUrls: string[]
): Promise<CopiedPhoto[]> {
  const kept: CopiedPhoto[] = [];
  for (const url of sourceUrls) {
    const photo = await copyOne(admin, listingId, url, kept.length);
    if (photo) kept.push(photo);
  }
  return kept;
}
