import { assertEquals } from 'jsr:@std/assert@1';

import { readBoundedBytes } from './photos.ts';

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
