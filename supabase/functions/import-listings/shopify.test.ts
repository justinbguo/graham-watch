import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { CatalogueRefused } from './robots.ts';
import { catalogueComplete, fetchText, USER_AGENT, type Json, type TextResponse } from './source.ts';
import { catalogueTitle, fetchShopifyItems, mapProduct, MAX_PAGES, SHOPIFY_PAUSE_MS } from './shopify.ts';

const ORIGIN = 'https://shop.com';

function product(fields: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Rolex Explorer 1016',
    handle: 'rolex-explorer-1016',
    vendor: 'Rolex',
    images: [{ src: 'https://cdn.shop.com/1.jpg' }],
    variants: [{ available: true, price: '19950.00', sku: 'CC-1016' }],
    ...fields,
  };
}

function kept(fields: Record<string, unknown> = {}, shopName: string | null = null) {
  const mapped = mapProduct(product(fields), ORIGIN, 'USD', shopName);
  return 'item' in mapped ? mapped.item : null;
}

function refused(fields: Record<string, unknown> = {}) {
  const mapped = mapProduct(product(fields), ORIGIN, 'USD');
  return 'skipped' in mapped ? mapped.skipped : null;
}

/* --------------------------------------------------------- product_type */

// The regression this exists for. Collectors Corner NY type their watches
// DRESS, SPORT, DIVER and MILITARY/FIELD. A filter demanding the word "watch"
// kept 3 of their 87 available watches and dropped the other 84 in silence.
Deno.test('keeps a watch typed with the shop own taxonomy', () => {
  for (const type of ['DRESS', 'SPORT', 'DIVER', 'MILITARY/FIELD', 'PILOTS', 'FUNKY/RETRO']) {
    assertEquals(kept({ product_type: type })?.title, 'Rolex Explorer 1016', type);
  }
});

Deno.test('keeps an untyped product, because a blank field states nothing', () => {
  assertEquals(kept({ product_type: '' })?.title, 'Rolex Explorer 1016');
  assertEquals(kept({ product_type: null })?.title, 'Rolex Explorer 1016');
});

Deno.test('refuses what the shop itself says is not a watch', () => {
  assertEquals(refused({ product_type: 'Straps' })?.reason, 'product type "Straps" is not a watch');
  assertEquals(refused({ product_type: 'SIGN' }) !== null, true);
  assertEquals(refused({ product_type: 'Sunglasses' }) !== null, true);
});

// The word "watch" earns a type nothing. These are the three most common
// non-watch types a watch dealer has, and all three contain it.
Deno.test('refuses a watch strap, a watch box and a watch winder', () => {
  assertEquals(refused({ product_type: 'Watch Straps' }) !== null, true);
  assertEquals(refused({ product_type: 'Watch Boxes' }) !== null, true);
  assertEquals(refused({ product_type: 'Watch Winder' }) !== null, true);
});

// "Signature" is not "sign", and "showcase" is not "case".
Deno.test('matches a whole word, not a prefix of one', () => {
  assertEquals(kept({ product_type: 'Signature Pieces' })?.title, 'Rolex Explorer 1016');
  assertEquals(kept({ product_type: 'Showcase' })?.title, 'Rolex Explorer 1016');
});

/* ------------------------------------------------------------- discards */

Deno.test('a discard carries the shop fields, so the operator sees why', () => {
  const skipped = refused({ product_type: 'Straps', vendor: 'Hirsch' });

  assertEquals(skipped?.sourceUrl, 'https://shop.com/products/rolex-explorer-1016');
  assertEquals(skipped?.meta?.vendor, 'Hirsch');
  assertEquals(skipped?.meta?.productType, 'Straps');
  assertEquals(skipped?.meta?.photoCount, 1);
});

Deno.test('a product with no photograph is refused rather than dropped', () => {
  assertEquals(refused({ images: [] })?.reason, 'no photograph');
});

/* ---------------------------------------------------------------- stock */

// Sold watches stay in the catalogue. They are what a dealer page is mostly
// made of, and retiring them is how the deck learns a watch is gone.
Deno.test('keeps a sold watch and marks it unavailable', () => {
  const item = kept({ variants: [{ available: false, price: '19950.00' }] });

  assertEquals(item?.available, false);
  assertEquals(item?.priceCents, 1_995_000);
});

Deno.test('reads stock as available when the shop states nothing', () => {
  assertEquals(kept({ variants: [{ price: '19950.00' }] })?.available, true);
});

Deno.test('refuses merch and sculpture, and keeps a type that only looks similar', () => {
  assertEquals(refused({ product_type: 'Merch' })?.reason, 'product type "Merch" is not a watch');
  assertEquals(refused({ product_type: 'Merchandise' }) !== null, true);
  assertEquals(refused({ product_type: 'Merch / Apparel' }) !== null, true);
  assertEquals(refused({ product_type: 'Sculpture' }) !== null, true);
  assertEquals(refused({ product_type: 'Two Piece' }) !== null, true);
  assertEquals(refused({ product_type: 'Two-Piece' }) !== null, true);
  assertEquals(refused({ product_type: 'Nato' }) !== null, true);
  // "Commercial" does not contain the word "merch".
  assertEquals(kept({ product_type: 'Commercial' })?.title, 'Rolex Explorer 1016');
});

Deno.test('prefixes a brand the title left out', () => {
  assertEquals(kept({ title: 'Explorer 1016', vendor: 'Rolex' })?.title, 'Rolex Explorer 1016');
});

Deno.test('does not present the shop name as the brand', () => {
  const item = kept(
    { title: '1989 Rolex Datejust 16220', vendor: "Danny's Vintage Watches" },
    "Danny's Vintage Watches"
  );
  assertEquals(item?.title, '1989 Rolex Datejust 16220');
  assertEquals(item?.meta?.vendor, "Danny's Vintage Watches");
});

Deno.test('treats Craft & Tailored as the same name as Craft + Tailored', () => {
  const item = kept({ title: '1940s Elgin A-11', vendor: 'Craft & Tailored' }, 'Craft + Tailored');
  assertEquals(item?.title, '1940s Elgin A-11');
  assertEquals(
    catalogueTitle('Craft and Tailored 1940s Elgin A-11', 'Craft & Tailored', 'Craft + Tailored'),
    '1940s Elgin A-11'
  );
});

Deno.test('strips a leading shop name and still keeps a real brand in the title', () => {
  const item = kept(
    {
      title: "Danny's Vintage Watches 1989 Rolex Datejust",
      vendor: 'Rolex',
    },
    'Danny’s Vintage Watches'
  );
  assertEquals(item?.title, '1989 Rolex Datejust');
});

Deno.test('does not prefix a placeholder vendor', () => {
  assertEquals(
    catalogueTitle('1940s Elgin A-11', 'Other', 'Craft + Tailored'),
    '1940s Elgin A-11'
  );
});

Deno.test('carries the SKU and the brand through as metadata', () => {
  const item = kept({ product_type: 'DRESS', published_at: '2024-03-11T00:00:00-04:00' });

  assertEquals(item?.meta?.sku, 'CC-1016');
  assertEquals(item?.meta?.vendor, 'Rolex');
  assertEquals(item?.meta?.productType, 'DRESS');
  assertEquals(item?.meta?.publishedAt, '2024-03-11T00:00:00-04:00');
});

/* --------------------------------------------------------------- paging */

function watch(id: number, fields: Record<string, unknown> = {}) {
  return product({ id, handle: `watch-${id}`, title: `Explorer ${id}`, ...fields });
}

/**
 * One fake shop. `pages` is keyed by the page parameter, and a missing page
 * is an empty feed, which is how Shopify ends a catalogue.
 */
function shop(pages: Json[][], options: { robots?: string; metaFails?: number } = {}) {
  const calls: string[] = [];
  const pauses: number[] = [];
  let metaFails = options.metaFails ?? 0;

  const fetchText = async (url: URL, _accept: string): Promise<TextResponse> => {
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: options.robots ?? 'User-agent: *\nAllow: /\n' };
    }
    if (url.pathname === '/meta.json') {
      if (metaFails > 0) {
        metaFails -= 1;
        return { status: 503, body: '' };
      }
      return {
        status: 200,
        body: JSON.stringify({ currency: 'USD', name: "Danny's Vintage Watches" }),
      };
    }
    const page = Number(url.searchParams.get('page') ?? '1');
    const batch = pages[page - 1] ?? [];
    return { status: 200, body: JSON.stringify({ products: batch }) };
  };

  return {
    calls,
    pauses,
    read: (limit = 100, pageSize?: number) =>
      fetchShopifyItems('https://shop.example', limit, 0, {
        fetchText,
        pause: async (ms) => {
          pauses.push(ms);
        },
        pageSize,
      }),
  };
}

Deno.test('a short read is incomplete when the adapter stopped early', () => {
  // The old check was `items.length < limit`. A page cap with room left in
  // the cap then looked like the end, and absence retired watches never read.
  assertEquals(catalogueComplete({ items: [1], complete: false }, 100), false);
  assertEquals(catalogueComplete({ items: [1], complete: true }, 100), true);
  assertEquals(catalogueComplete({ items: [1, 2] }, 2), false);
  assertEquals(catalogueComplete({ items: [1] }, 2), true);
});

Deno.test('walks past the old ten-page ceiling until the feed ends', async () => {
  const pages = Array.from({ length: 11 }, (_, index) => [watch(index + 1)]);
  const fixture = shop(pages);
  const read = await fixture.read(100, 1);

  assertEquals(read?.complete, true);
  assertEquals(read?.items.length, 11);
  assertEquals(read?.items[10]?.externalId, 'shopify:11');
  assertEquals(fixture.calls.some((call) => call.includes('page=11')), true);
  assertEquals(fixture.calls.filter((call) => call.includes('page=12')).length, 1);
  assertEquals(fixture.pauses.every((ms) => ms === SHOPIFY_PAUSE_MS), true);
  assertEquals(fixture.calls[0], '/robots.txt');
});

Deno.test('asks Shopify for 250 products a page and stops on a short page', async () => {
  const fixture = shop([[watch(1)]]);
  const read = await fixture.read();

  assertEquals(read?.complete, true);
  assertEquals(read?.items.length, 1);
  assertEquals(fixture.calls.some((call) => call.includes('limit=250')), true);
  assertEquals(fixture.calls.some((call) => call.includes('page=2')), false);
});

Deno.test('the page ceiling is incomplete even when the item cap had room', async () => {
  const pages = Array.from({ length: MAX_PAGES + 5 }, (_, index) => [watch(index + 1)]);
  const fixture = shop(pages);
  const read = await fixture.read(10_000, 1);

  assertEquals(read?.complete, false);
  assertEquals(read?.items.length, MAX_PAGES);
  assertEquals(fixture.calls.some((call) => call.includes(`page=${MAX_PAGES}`)), true);
  assertEquals(fixture.calls.some((call) => call.includes(`page=${MAX_PAGES + 1}`)), false);
});

Deno.test('hitting the kept-watch limit does not claim the feed ended', async () => {
  const fixture = shop([
    [watch(1), watch(2)],
    [watch(3), watch(4)],
  ]);
  const read = await fixture.read(3, 2);

  assertEquals(read?.complete, false);
  assertEquals(read?.items.length, 3);
  assertEquals(fixture.calls.some((call) => call.includes('page=3')), false);
});

Deno.test('a repeated page is not the end of the shop', async () => {
  const same = [watch(1), watch(2)];
  const fixture = shop([same, same]);
  const read = await fixture.read(100, 2);

  assertEquals(read?.complete, false);
  assertEquals(read?.items.map((item) => item.externalId), ['shopify:1', 'shopify:2']);
  assertEquals(fixture.calls.some((call) => call.includes('page=3')), false);
});

Deno.test('a page that fails after one retry leaves the read incomplete', async () => {
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/robots.txt') return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    if (url.pathname === '/meta.json') {
      return { status: 200, body: JSON.stringify({ currency: 'USD', name: 'Shop' }) };
    }
    const page = Number(url.searchParams.get('page') ?? '1');
    if (page === 1) return { status: 200, body: JSON.stringify({ products: [watch(1), watch(2)] }) };
    return { status: 503, body: '' };
  };

  const read = await fetchShopifyItems('https://shop.example', 100, 0, {
    fetchText,
    pause: async () => {},
    pageSize: 2,
  });

  assertEquals(read?.complete, false);
  assertEquals(read?.items.length, 2);
  assertEquals(calls.filter((call) => call.includes('page=2')).length, 2);
});

Deno.test('a feed that never answers is a refusal, not another adapter', async () => {
  const fetchText = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    return { status: 503, body: '' };
  };

  await assertRejects(
    () => fetchShopifyItems('https://shop.example', 100, 0, { fetchText, pause: async () => {} }),
    CatalogueRefused
  );
});

Deno.test('a 404 product feed is not Shopify', async () => {
  const fetchText = async (url: URL): Promise<TextResponse | null> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    return { status: 404, body: '' };
  };

  assertEquals(
    await fetchShopifyItems('https://shop.example', 100, 0, { fetchText, pause: async () => {} }),
    null
  );
});

Deno.test('robots.txt is read before the feed, and a disallow is not fetched', async () => {
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(url.pathname);
    return { status: 200, body: 'User-agent: *\nDisallow: /products.json\n' };
  };

  await assertRejects(
    () => fetchShopifyItems('https://shop.example', 100, 0, { fetchText, pause: async () => {} }),
    CatalogueRefused
  );
  assertEquals(calls, ['/robots.txt']);
});

Deno.test('a crawl-delay slower than the edge function can keep is a refusal', async () => {
  const fetchText = async (url: URL): Promise<TextResponse> => {
    if (url.pathname !== '/robots.txt') throw new Error(`fetched ${url.pathname}`);
    return { status: 200, body: 'User-agent: *\nCrawl-delay: 30\nAllow: /\n' };
  };

  await assertRejects(
    () => fetchShopifyItems('https://shop.example', 100, 0, { fetchText, pause: async () => {} }),
    CatalogueRefused
  );
});

Deno.test('a crawl-delay raises the pause, and one meta failure is retried', async () => {
  const fixture = shop([[watch(1, { vendor: "Danny's Vintage Watches", title: '1989 Rolex Datejust' })]], {
    robots: 'User-agent: *\nAllow: /\nCrawl-delay: 2\n',
    metaFails: 1,
  });
  const read = await fixture.read(10, 250);

  assertEquals(read?.complete, true);
  assertEquals(read?.items[0]?.title, '1989 Rolex Datejust');
  assertEquals(read?.items[0]?.currency, 'USD');
  assertEquals(fixture.pauses.every((ms) => ms === 2_000), true);
  assertEquals(fixture.calls.filter((call) => call === '/meta.json').length, 2);
});

Deno.test('merch is skipped and does not hide the watch after it', async () => {
  const fixture = shop(
    [[watch(1, { product_type: 'Merch', title: 'Cap' }), watch(2, { title: 'Submariner', vendor: 'Rolex' })]],
    {}
  );
  const read = await fixture.read(10, 2);

  assertEquals(read?.complete, true);
  assertEquals(read?.items.map((item) => item.title), ['Rolex Submariner']);
  assertEquals(read?.skipped[0]?.reason, 'product type "Merch" is not a watch');
});

Deno.test('the catalogue reader names itself GrahamBot', async () => {
  const original = globalThis.fetch;
  let seen = '';
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    seen = new Headers(init?.headers).get('User-Agent') ?? '';
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  try {
    await fetchText(new URL('https://shop.example/robots.txt'), 'text/plain');
    assertEquals(seen, USER_AGENT);
  } finally {
    globalThis.fetch = original;
  }
});
