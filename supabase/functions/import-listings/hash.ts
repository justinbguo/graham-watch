import type { SourceItem } from './source.ts';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// A field separator that cannot appear in any of the parts, so "ab" + "c" and
// "a" + "bc" do not fingerprint the same.
const SEP = '\u0000';

/**
 * The prose the model reads. Rewording this is the only change that needs an
 * extraction again, and extraction is the only part of a refresh that costs
 * money — so this hash is what stands between a nightly refresh and a bill.
 */
export function textFingerprint(item: SourceItem): Promise<string> {
  return sha256([item.title, item.text].join(SEP));
}

/**
 * Everything that reaches a listing. Price, stock and gallery changes land here
 * but not in the text hash, so they update the deck without a model call.
 */
export function contentFingerprint(item: SourceItem): Promise<string> {
  return sha256(
    [
      item.title,
      item.text,
      String(item.priceCents ?? ''),
      item.currency ?? '',
      item.available ? 'in' : 'out',
      item.photoUrls.join(','),
    ].join(SEP)
  );
}

/**
 * A refresh may add photographs. It may not replace a fuller gallery with a
 * shorter read. Cool Vintage's collection grid has one image; if the product
 * page fails, the listing keeps the photos already on the deck.
 */
export function refreshGallery(existingCount: number, incomingCount: number): 'keep' | 'replace' {
  if (existingCount > 0 && incomingCount < existingCount) return 'keep';
  return 'replace';
}

export function photosFingerprint(photoUrls: string[]): Promise<string> {
  return sha256(photoUrls.join(SEP));
}
