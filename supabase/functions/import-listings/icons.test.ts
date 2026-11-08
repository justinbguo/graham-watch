import { assertEquals } from 'jsr:@std/assert@1';

import { chooseDealerIcon, isDefaultPlatformIcon, recoverIconUrls } from './icons.ts';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

function png(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const header = new DataView(out.buffer);
    header.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    const covered = out.subarray(4, 8 + data.length);
    header.setUint32(8 + data.length, crc32(covered));
    return out;
  };
  const body = chunk('IHDR', ihdr);
  const end = chunk('IEND', new Uint8Array());
  const bytes = new Uint8Array(signature.length + body.length + end.length);
  bytes.set(signature);
  bytes.set(body, signature.length);
  bytes.set(end, signature.length + body.length);
  return bytes;
}

function respond(files: Record<string, { status?: number; png?: [number, number] }>) {
  const seen: string[] = [];
  const fetcher = (url: string) => {
    seen.push(url);
    const file = files[url];
    if (!file || file.status === 404) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    const [width, height] = file.png ?? [16, 16];
    const bytes = png(width, height);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return Promise.resolve(
      new Response(copy, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
  };
  return { fetcher, seen };
}

Deno.test('a Shopify 32px crop is recovered and the 300px original wins', async () => {
  const declared =
    'https://collectorscornerny.com/cdn/shop/files/CCNY_dec3b64d-4784-4775-b734-6acb28abd60d.png?crop=center&height=32&v=1784836775&width=32';
  const recovered = recoverIconUrls(declared);
  assertEquals(recovered[0].includes('width='), false);
  assertEquals(recovered[0].includes('crop='), false);
  assertEquals(recovered[0].includes('height='), false);
  assertEquals(
    recoverIconUrls('https://thetimecurator.com/cdn/shop/files/fvicon_32x32.jpg?v=1617507435')[0],
    'https://thetimecurator.com/cdn/shop/files/fvicon.jpg?v=1617507435',
  );
  const original = recovered[0];
  const { fetcher, seen } = respond({
    [declared]: { png: [32, 32] },
    [original]: { png: [300, 300] },
  });
  const chosen = await chooseDealerIcon({
    html: `<link rel="shortcut icon" href="${declared}">`,
    origin: 'https://collectorscornerny.com',
    fetch: fetcher,
  });
  assertEquals(chosen, original);
  assertEquals(seen.some((url) => url.includes('google.com')), false);
});

Deno.test('a Squarespace 100w transform is recovered to the original', async () => {
  const declared =
    'https://images.squarespace-cdn.com/content/v1/62584b0dea70ac02dde2a696/4ec1c87f-0933-4436-8b5e-aa8282eb8794/favicon.ico?format=100w';
  const original =
    'https://images.squarespace-cdn.com/content/v1/62584b0dea70ac02dde2a696/4ec1c87f-0933-4436-8b5e-aa8282eb8794/favicon.ico';
  assertEquals(recoverIconUrls(declared)[0], original);
  const { fetcher } = respond({
    [declared]: { png: [100, 100] },
    [original]: { png: [512, 512] },
  });
  assertEquals(
    await chooseDealerIcon({
      html: `<link rel="icon" href="${declared}">`,
      origin: 'https://goodevening.co',
      fetch: fetcher,
    }),
    original,
  );
});

Deno.test('a 404 falls through to the next declared icon', async () => {
  const missing = 'https://shop.example/missing.png';
  const mark = 'https://shop.example/mark.png';
  const { fetcher } = respond({
    [missing]: { status: 404 },
    [mark]: { png: [180, 180] },
  });
  assertEquals(
    await chooseDealerIcon({
      html: `<link rel="apple-touch-icon" href="${missing}"><link rel="icon" href="${mark}">`,
      origin: 'https://shop.example',
      fetch: fetcher,
    }),
    mark,
  );
});

Deno.test('the Squarespace default favicon is rejected and the header logo is used', async () => {
  const fallback = 'https://assets.squarespace.com/universal/default-favicon.ico';
  const logo =
    'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1442479070416-UW1OTITGR0O9E1M0J6IT/clogo22.png';
  assertEquals(isDefaultPlatformIcon(fallback), true);
  const { fetcher, seen } = respond({
    [fallback]: { png: [256, 256] },
    [logo]: { png: [463, 119] },
  });
  assertEquals(
    await chooseDealerIcon({
      html: `<link rel="icon" href="${fallback}"><header><img class="Header-branding-logo" src="${logo}" alt="Cool Vintage Watches"></header>`,
      origin: 'https://coolvintagewatches.com',
      fetch: fetcher,
    }),
    logo,
  );
  assertEquals(seen.includes(fallback), false);
});

Deno.test('a stored larger icon is kept when the new find is smaller', async () => {
  const current = 'https://cdn.example/current.png';
  const small = 'https://cdn.example/small.png';
  const { fetcher } = respond({
    [current]: { png: [512, 512] },
    [small]: { png: [32, 32] },
  });
  assertEquals(
    await chooseDealerIcon({
      html: `<link rel="icon" href="${small}">`,
      origin: 'https://cdn.example',
      currentUrl: current,
      fetch: fetcher,
    }),
    current,
  );
});

Deno.test('a null probe keeps the stored icon', async () => {
  const current = 'https://cdn.example/current.png';
  const { fetcher } = respond({});
  assertEquals(
    await chooseDealerIcon({
      html: '<html></html>',
      origin: 'https://cdn.example',
      currentUrl: current,
      fetch: fetcher,
    }),
    current,
  );
});

Deno.test('a failed page keeps a stored icon', async () => {
  const current = 'https://cdn.example/current.png';
  const { fetcher } = respond({
    [current]: { png: [100, 100] },
  });
  assertEquals(
    await chooseDealerIcon({
      html: '<link rel="icon" href="https://cdn.example/gone.png">',
      origin: 'https://cdn.example',
      currentUrl: current,
      fetch: fetcher,
    }),
    current,
  );
});
