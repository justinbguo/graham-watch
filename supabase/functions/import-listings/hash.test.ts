import { assertEquals } from 'jsr:@std/assert@1';

import { photosFingerprint, refreshGallery } from './hash.ts';

// The backfill migration stamps source_items.photos_hash with this same
// digest, built in SQL because a text value cannot hold the NUL separator.
// encode(convert_to(url, 'UTF8'), 'hex') joined by '00', then decoded, is
// the byte string photosFingerprint hashes.
function migrationPayload(urls: string[]): Uint8Array {
  const hex = urls
    .map((url) =>
      Array.from(new TextEncoder().encode(url))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
    )
    .join('00');
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.test('a gallery fingerprint is the photo URLs joined by a NUL byte', async () => {
  const urls = [
    'https://cdn.shop.com/a.jpg',
    'https://cdn.shop.com/b.webp',
  ];
  assertEquals(await photosFingerprint(urls), await sha256Hex(migrationPayload(urls)));
  assertEquals(await photosFingerprint([urls[0]]), await sha256Hex(migrationPayload([urls[0]])));
  assertEquals(await photosFingerprint([]), await sha256Hex(new Uint8Array()));
});

Deno.test('a refresh does not replace a gallery with fewer photographs', () => {
  assertEquals(refreshGallery(6, 1), 'keep');
  assertEquals(refreshGallery(6, 5), 'keep');
  assertEquals(refreshGallery(6, 6), 'replace');
  assertEquals(refreshGallery(6, 8), 'replace');
  assertEquals(refreshGallery(0, 1), 'replace');
});
