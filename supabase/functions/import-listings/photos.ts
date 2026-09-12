import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

const BUCKET = 'listing-photos';
const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export type CopiedPhoto = {
  url: string;
  source_url: string;
  position: number;
};

/**
 * Copies one photo into storage and returns the row to insert. Returns the
 * original URL on any failure: a missing photo is worth far less than a failed
 * import, and hot-linking is what we did before anyway.
 */
async function copyOne(
  admin: SupabaseClient,
  listingId: string,
  sourceUrl: string,
  position: number
): Promise<CopiedPhoto> {
  const fallback = { url: sourceUrl, source_url: sourceUrl, position };

  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'GrahamBot/0.1 (+https://graham.app)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return fallback;

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    const extension = EXTENSIONS[contentType];
    // Dealer pages link to plenty of things that are not photographs.
    if (!extension) return fallback;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return fallback;

    const path = `${listingId}/${position}.${extension}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (error) return fallback;

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, source_url: sourceUrl, position };
  } catch {
    return fallback;
  }
}

/**
 * Photos are copied in parallel because each one is a separate round trip to a
 * server we do not control, and a slow dealer should not serialise the rest.
 */
export function copyPhotos(
  admin: SupabaseClient,
  listingId: string,
  sourceUrls: string[]
): Promise<CopiedPhoto[]> {
  return Promise.all(sourceUrls.map((url, position) => copyOne(admin, listingId, url, position)));
}
