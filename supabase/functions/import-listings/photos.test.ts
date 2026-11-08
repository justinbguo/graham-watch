import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2';

import { SQUARESPACE_NO_IMAGE } from './fixtures/squarespace-no-image.ts';
import { copyPhotos, isPlaceholderPhoto, readBoundedBytes } from './photos.ts';

Deno.test('readBoundedBytes returns a photograph under the cap', async () => {
  const payload = new Uint8Array([1, 2, 3, 4]);
  const bytes = await readBoundedBytes(new Response(payload), 8);
  assertEquals(bytes, payload);
});

Deno.test('readBoundedBytes stops before buffering a file past the cap', async () => {
  const chunk = new Uint8Array(64);
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    })
  );
  const bytes = await readBoundedBytes(response, 80);
  assertEquals(bytes, null);
});

Deno.test('readBoundedBytes refuses a Content-Length over the cap without reading', async () => {
  let pulled = false;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        pulled = true;
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    }),
    { headers: { 'content-length': '100' } }
  );
  const bytes = await readBoundedBytes(response, 10);
  assertEquals(bytes, null);
  assertEquals(pulled, false);
});

function png(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width);
  new DataView(ihdr.buffer).setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, 0);
    return out;
  };
  const body = chunk('IHDR', ihdr);
  const bytes = new Uint8Array(signature.length + body.length);
  bytes.set(signature);
  bytes.set(body, signature.length);
  return bytes;
}

Deno.test('the Squarespace no-image file is rejected and a real small PNG is not', async () => {
  assertEquals(SQUARESPACE_NO_IMAGE.byteLength, 2102);
  assertEquals(await isPlaceholderPhoto(SQUARESPACE_NO_IMAGE), true);
  assertEquals(await isPlaceholderPhoto(png(8, 8)), false);
});

Deno.test('a placeholder in front of a real photograph is dropped and the photograph becomes first', async () => {
  const placeholder = SQUARESPACE_NO_IMAGE;
  const real = png(8, 8);
  const files = new Map<string, Uint8Array>([
    ['https://cdn.example/missing', placeholder],
    ['https://cdn.example/watch.jpg', real],
  ]);
  const previous = globalThis.fetch;
  globalThis.fetch = ((url: string) => {
    const bytes = files.get(String(url));
    const copy = bytes ? new ArrayBuffer(bytes.byteLength) : null;
    if (bytes && copy) new Uint8Array(copy).set(bytes);
    return Promise.resolve(
      new Response(copy, {
        status: bytes ? 200 : 404,
        headers: { 'content-type': 'image/png' },
      }),
    );
  }) as typeof fetch;
  const admin = {
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  } as unknown as SupabaseClient;
  try {
    const photos = await copyPhotos(admin, 'listing-1', [
      'https://cdn.example/missing',
      'https://cdn.example/watch.jpg',
    ]);
    assertEquals(photos, [
      { source_url: 'https://cdn.example/watch.jpg', storage_path: 'listing-1/0.png', position: 0 },
    ]);
  } finally {
    globalThis.fetch = previous;
  }
});
