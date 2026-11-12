import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import book from './fixtures/woocommerce/book.json' with { type: 'json' };
import live from './fixtures/woocommerce/live.json' with { type: 'json' };
import sign from './fixtures/woocommerce/sign.json' with { type: 'json' };
import sold from './fixtures/woocommerce/sold.json' with { type: 'json' };
import soldTitle from './fixtures/woocommerce/uncat-sold-title.json' with {
  type: 'json',
};
import zero from './fixtures/woocommerce/zero.json' with { type: 'json' };
import { CatalogueRefused } from './robots.ts';
import type { Json, SkippedItem, SourceItem, TextResponse } from './source.ts';
import { fetchWooCommerceItems, mapWooProduct } from './woocommerce.ts';

const ORIGIN = 'https://classicwatchny.com';

function kept(raw: Json, minPhotos = 1): SourceItem | null {
  const mapped = mapWooProduct(raw, ORIGIN, minPhotos);
  return 'reason' in mapped ? null : mapped;
}

function skipped(raw: Json, minPhotos = 1): SkippedItem | null {
  const mapped = mapWooProduct(raw, ORIGIN, minPhotos);
  return 'reason' in mapped ? mapped : null;
}

function httpPhotoUrls(raw: Json): string[] {
  const images = Array.isArray(raw.images) ? raw.images : [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    const src = image?.src;
    if (typeof src !== 'string' || !src.startsWith('http') || seen.has(src)) {
      continue;
    }
    seen.add(src);
    urls.push(src);
  }
  return urls;
}

function pricedWatch(fields: Json): Json {
  return {
    ...sold,
    id: 90001,
    name: 'Rolex Oyster Booklet',
    permalink: 'https://classicwatchny.com/watches/watch-collection/rolex-oyster-booklet/',
    is_in_stock: true,
    prices: {
      price: '120000',
      regular_price: '120000',
      sale_price: '120000',
      currency_code: 'USD',
      currency_minor_unit: 2,
    },
    categories: [{ id: 194, name: 'Watches', slug: 'watch-collection' }],
    tags: [{ id: 3, name: 'Vintage', slug: 'vintage-slug' }],
    images: [{
      src: 'https://classicwatchny.com/wp-content/uploads/booklet.jpg',
    }],
    ...fields,
  };
}

const ALLOW = 'User-agent: *\nAllow: /\n';
const PRODUCTS_PATH = '/wp-json/wc/store/v1/products';

function shop(pages: Json[][], pageSize = 100) {
  const calls: string[] = [];
  const pauses: number[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    const page = Number(url.searchParams.get('page') ?? '1');
    const batch = pages[page - 1] ?? [];
    return { status: 200, body: JSON.stringify(batch) };
  };
  return {
    calls,
    pauses,
    read: (
      limit = 100,
      extra: { startPage?: number; maxPages?: number; minPhotos?: number } = {},
    ) =>
      fetchWooCommerceItems(ORIGIN, limit, extra.minPhotos ?? 1, {
        fetchText,
        pause: async (ms) => {
          pauses.push(ms);
        },
        pageSize,
        startPage: extra.startPage,
        maxPages: extra.maxPages,
      }),
  };
}

Deno.test('a priced watch is publishable and a zero price is not stored', () => {
  const item = kept(live);
  assertEquals(item?.priceCents, 1_550_000);
  assertEquals(item?.currency, 'USD');
  assertEquals(item?.externalId, 'woocommerce:41012');
  assertEquals(item?.available, true);
  assertEquals(item?.holdReason, undefined);
  assertEquals(item?.title, live.name);
  assertEquals(item?.photoUrls, httpPhotoUrls(live));
  assertEquals(item?.photoUrls.length, live.images.length);
  assertEquals(item?.text.includes('&#8217;'), false);
  assertEquals(item?.text.includes('Franck Muller\u2019s'), true);
  assertEquals(item?.meta?.vendor, null);
  assertEquals(item?.meta?.productType, 'Watches');
  assertEquals(item?.meta?.sku, null);

  const doubled = { ...live, images: [...live.images, live.images[0]] };
  assertEquals(kept(doubled)?.photoUrls, httpPhotoUrls(live));

  const unpriced = skipped(zero);
  assertEquals(unpriced?.reason, 'no price');
  assertEquals(kept(zero), null);
});

Deno.test('sold stock stays in the archive and off the deck', () => {
  const byCategory = kept(sold);
  assertEquals(byCategory?.available, false);
  assertEquals(byCategory?.holdReason, undefined);
  assertEquals(byCategory?.externalId, 'woocommerce:40761');
  assertEquals(byCategory?.priceCents, null);
  assertEquals(byCategory?.currency, null);
  assertEquals(byCategory?.meta?.productType, null);

  const byTitle = kept(soldTitle);
  assertEquals(byTitle?.available, false);
  assertEquals(byTitle?.holdReason, undefined);
  assertEquals(byTitle?.externalId, 'woocommerce:24186');
  assertEquals(byTitle?.photoUrls, httpPhotoUrls(soldTitle));
  assertEquals(
    (byTitle?.photoUrls.length ?? 0) < soldTitle.images.length,
    true,
  );

  const stillForSale = kept({ ...live, is_in_stock: false });
  assertEquals(stillForSale?.available, true);
  assertEquals(stillForSale?.priceCents, 1_550_000);
});

Deno.test('a book and a display sign are skips, and a booklet stays a watch', () => {
  assertEquals(skipped(book)?.reason, 'title is a book');
  assertEquals(kept(book), null);
  assertEquals(skipped(sign)?.reason, 'title is a display sign');
  assertEquals(kept(sign), null);

  const booklet = kept(pricedWatch({ name: 'Rolex Oyster Booklet' }));
  assertEquals(booklet?.available, true);
  assertEquals(booklet?.holdReason, undefined);
  assertEquals(booklet?.priceCents, 120_000);
  assertEquals(booklet?.meta?.tags, ['Vintage']);

  assertEquals(
    skipped(pricedWatch({ id: 90002, name: 'Rolex Service Book' }))?.reason,
    'title is a book',
  );
  assertEquals(
    kept(pricedWatch({ id: 90003, name: 'Submariner 5513 with book' }))
      ?.available,
    true,
  );
  assertEquals(
    kept(pricedWatch({ id: 90004, name: 'Rolex box and book' }))?.available,
    true,
  );
  assertEquals(
    kept(pricedWatch({ id: 90005, name: 'Daytona book and papers' }))
      ?.available,
    true,
  );
  assertEquals(
    kept(pricedWatch({ id: 90006, name: 'Hermes signed' }))?.available,
    true,
  );

  const pocket = kept(
    pricedWatch({
      id: 90007,
      name: 'Elgin pocket watch',
      prices: {
        price: '0',
        currency_code: 'USD',
        currency_minor_unit: 2,
      },
    }),
  );
  assertEquals(pocket?.holdReason, 'not_a_watch');
  assertEquals(pocket?.available, true);
  assertEquals(pocket?.priceCents, null);
});

Deno.test('a price that is not a positive cent amount is skipped', () => {
  assertEquals(
    skipped(
      pricedWatch({
        prices: { price: '0', currency_code: 'USD', currency_minor_unit: 2 },
      }),
    )?.reason,
    'no price',
  );
  assertEquals(
    skipped(
      pricedWatch({
        prices: {
          price: '15500.00',
          currency_code: 'USD',
          currency_minor_unit: 2,
        },
      }),
    )?.reason,
    'no price',
  );
  assertEquals(
    skipped(
      pricedWatch({
        prices: {
          price: '-1550000',
          currency_code: 'USD',
          currency_minor_unit: 2,
        },
      }),
    )?.reason,
    'no price',
  );
  assertEquals(
    skipped(
      pricedWatch({
        prices: {
          price: '1550001',
          currency_code: 'USD',
          currency_minor_unit: 3,
        },
      }),
    )?.reason,
    'no price',
  );
  assertEquals(
    kept(
      pricedWatch({
        prices: { price: '155', currency_code: 'USD', currency_minor_unit: 0 },
      }),
    )?.priceCents,
    15_500,
  );
});

Deno.test('an empty description uses the short description', () => {
  const item = kept(pricedWatch({
    description: '   ',
    short_description: '<p>Short &#038; sweet&#8217;s note</p>',
  }));
  assertEquals(item?.text.includes('&#038;'), false);
  assertEquals(item?.text.includes('&#8217;'), false);
  assertEquals(item?.text.includes('Short & sweet\u2019s note'), true);
});

Deno.test('a title with an entity is decoded', () => {
  const item = kept(pricedWatch({ name: 'Rolex&#8217;s Explorer &amp; Date' }));
  assertEquals(item?.title, 'Rolex\u2019s Explorer & Date');
});

Deno.test('the feed keeps sold watches and drops the book, the sign, and a zero price', async () => {
  const fixture = shop([[live, zero, sold, book, sign, soldTitle]]);
  const read = await fixture.read();
  assertEquals(read?.recognized, true);
  assertEquals(read?.complete, true);
  assertEquals(read?.nextPage, undefined);
  assertEquals(
    read?.items.map((item) => item.externalId),
    ['woocommerce:41012', 'woocommerce:40761', 'woocommerce:24186'],
  );
  assertEquals(read?.items[0]?.priceCents, 1_550_000);
  assertEquals(read?.items[0]?.available, true);
  assertEquals(read?.items[1]?.available, false);
  assertEquals(read?.items[2]?.available, false);
  assertEquals(
    read?.items.every((item) => item.available === false || (item.priceCents ?? 0) > 0),
    true,
  );
  assertEquals(read?.skipped.map((item) => item.reason), [
    'no price',
    'title is a book',
    'title is a display sign',
  ]);
  assertEquals(
    fixture.calls.some((call) =>
      call ===
        '/wp-json/wc/store/v1/products?per_page=100&page=1&orderby=id&order=asc'
    ),
    true,
  );
});

Deno.test('a first page that is not a product array is not WooCommerce', async () => {
  const calls: string[] = [];
  const missing = async (url: URL): Promise<TextResponse> => {
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    return { status: 404, body: '' };
  };
  assertEquals(
    await fetchWooCommerceItems(ORIGIN, 10, 1, {
      fetchText: missing,
      pause: async () => {},
    }),
    null,
  );
  assertEquals(calls.filter((call) => call.includes('/products')).length, 1);

  const objectBody = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    return { status: 200, body: JSON.stringify({ products: [live] }) };
  };
  assertEquals(
    await fetchWooCommerceItems(ORIGIN, 10, 1, {
      fetchText: objectBody,
      pause: async () => {},
    }),
    null,
  );
});

Deno.test('a 403 is retried, and a feed that stays closed is refused', async () => {
  const pauses: number[] = [];
  let attempts = 0;
  const thenOk = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    attempts += 1;
    if (attempts < 3) return { status: 403, body: '' };
    return { status: 200, body: JSON.stringify([live]) };
  };
  const read = await fetchWooCommerceItems(ORIGIN, 10, 1, {
    fetchText: thenOk,
    pause: async (ms) => {
      pauses.push(ms);
    },
  });
  assertEquals(read?.recognized, true);
  assertEquals(read?.items[0]?.externalId, 'woocommerce:41012');
  assertEquals(attempts, 3);
  assertEquals(pauses, [1_000, 1_000, 2_000]);

  let refusedAttempts = 0;
  const staysClosed = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    refusedAttempts += 1;
    return { status: 403, body: '' };
  };
  const refusedPauses: number[] = [];
  await assertRejects(
    () =>
      fetchWooCommerceItems(ORIGIN, 10, 1, {
        fetchText: staysClosed,
        pause: async (ms) => {
          refusedPauses.push(ms);
        },
      }),
    CatalogueRefused,
  );
  assertEquals(refusedAttempts, 4);
  assertEquals(refusedPauses, [1_000, 1_000, 2_000, 4_000]);
});

Deno.test('one page of the budget names the next page, and the next call finishes', async () => {
  const second = { ...live, id: 41013, name: 'Rolex Explorer 1016' };
  const first = shop([[live, sold], [second]], 2);
  const opened = await first.read(100, { maxPages: 1 });
  assertEquals(opened?.complete, false);
  assertEquals(opened?.nextPage, 2);
  assertEquals(opened?.items.map((item) => item.externalId), [
    'woocommerce:41012',
    'woocommerce:40761',
  ]);
  assertEquals(
    first.calls.filter((call) => new URL(call, ORIGIN).searchParams.get('page') === '2').length,
    0,
  );

  const rest = shop([[live, sold], [second]], 2);
  const closed = await rest.read(100, { startPage: 2, maxPages: 1 });
  assertEquals(closed?.complete, true);
  assertEquals(closed?.nextPage, undefined);
  assertEquals(closed?.items.map((item) => item.externalId), [
    'woocommerce:41013',
  ]);
  assertEquals(
    rest.calls.some((call) => new URL(call, ORIGIN).searchParams.get('page') === '1'),
    false,
  );
  assertEquals(rest.calls.some((call) => call.includes('orderby=id')), true);
  assertEquals(rest.calls.some((call) => call.includes('order=asc')), true);
});

Deno.test('an empty product array is this platform and the feed is done', async () => {
  const fetchText = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    return { status: 200, body: '[]' };
  };
  const read = await fetchWooCommerceItems(ORIGIN, 10, 1, {
    fetchText,
    pause: async () => {},
  });
  assertEquals(read?.recognized, true);
  assertEquals(read?.complete, true);
  assertEquals(read?.nextPage, undefined);
  assertEquals(read?.items, []);
});

Deno.test('a repeated page is not the end of the shop', async () => {
  const fixture = shop([[live, sold], [live, sold]], 2);
  const read = await fixture.read();
  assertEquals(read?.complete, false);
  assertEquals(read?.nextPage, undefined);
  assertEquals(read?.items.map((item) => item.externalId), [
    'woocommerce:41012',
    'woocommerce:40761',
  ]);
  assertEquals(
    fixture.calls.filter((call) => new URL(call, ORIGIN).searchParams.get('page') === '3').length,
    0,
  );
});

Deno.test('a later page that fails does not resume on that page', async () => {
  let failed = 0;
  const fetchText = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: ALLOW };
    const page = Number(url.searchParams.get('page') ?? '1');
    if (page === 1) return { status: 200, body: JSON.stringify([live]) };
    failed += 1;
    return { status: 503, body: '' };
  };
  const read = await fetchWooCommerceItems(ORIGIN, 10, 1, {
    fetchText,
    pause: async () => {},
    pageSize: 1,
    maxPages: 4,
  });
  assertEquals(read?.complete, false);
  assertEquals(read?.nextPage, undefined);
  assertEquals(read?.items.length, 1);
  assertEquals(failed, 4);
});

Deno.test('robots.txt can refuse the products path', async () => {
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(url.pathname);
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: 'User-agent: *\nDisallow: /wp-json/\n' };
    }
    return { status: 200, body: '[]' };
  };
  await assertRejects(
    () =>
      fetchWooCommerceItems(ORIGIN, 10, 1, {
        fetchText,
        pause: async () => {},
      }),
    CatalogueRefused,
  );
  assertEquals(calls.includes(PRODUCTS_PATH), false);
});
