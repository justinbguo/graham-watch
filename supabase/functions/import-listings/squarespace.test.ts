import { assertEquals } from 'jsr:@std/assert@1';

import type { TextResponse } from './source.ts';
import {
  fetchSquarespaceItems,
  squarespaceCollectionPaths,
  squarespacePhotoUrls,
  squarespacePrice,
  squarespaceRecords,
} from './squarespace.ts';

Deno.test('a homepage sitemap yields every watch collection and skips cameras', () => {
  const origin = 'https://www.coolvintagewatches.com';
  const paths = squarespaceCollectionPaths([
    `${origin}/under350/uw59`,
    `${origin}/rolex/bubbleback`,
    `${origin}/cameras/leica-m5`,
    `${origin}/pocket-watches/pw12`,
    `${origin}/watches`,
    `${origin}/blog-montauk/2012/6/11/latest`,
  ]);
  assertEquals(paths, [`${origin}/under350`, `${origin}/rolex`, `${origin}/pocket-watches`]);
});

Deno.test('falls back to the available variant when the product price is zero', () => {
  assertEquals(
    squarespacePrice({
      structuredContent: {
        priceMoney: { currency: 'USD', value: '0.00' },
        variants: [
          {
            priceMoney: { currency: 'USD', value: '19950.00' },
            qtyInStock: 1,
          },
        ],
      },
    }),
    { priceCents: 1_995_000, currency: 'USD' }
  );
});

Deno.test('keeps a positive product price ahead of its variants', () => {
  assertEquals(
    squarespacePrice({
      structuredContent: {
        priceMoney: { currency: 'USD', value: '12500.00' },
        variants: [
          {
            priceMoney: { currency: 'USD', value: '13000.00' },
            qtyInStock: 1,
          },
        ],
      },
    }),
    { priceCents: 1_250_000, currency: 'USD' }
  );
});

const JEFFREY_GALLERY =
  'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1692129454145-2QTCLO97B929YLUO3RO6/IMG_3516.jpg';
const BUCHERER_ROOT =
  'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1686326001830-NM4Y9D9JJWDGPSXI929T/IMG_0969.jpg';
const BUCHERER_GALLERY =
  'https://images.squarespace-cdn.com/content/v1/55e87a4ae4b0ef4233ddf7a9/1686238210652-T632ELQ4DM7VRXBI1HQF/IMG_0970.jpg';

Deno.test('Hamilton Jeffrey drops the extensionless root and keeps the gallery', () => {
  assertEquals(
    squarespacePhotoUrls({
      assetUrl:
        'https://static1.squarespace.com/static/55e87a4ae4b0ef4233ddf7a9/55f19b7ce4b0d3922cc55308/64dbd85cadd6f456177582d3/1762439973819/',
      items: [{ assetUrl: JEFFREY_GALLERY }],
    }),
    [`${JEFFREY_GALLERY}?format=1500w`],
  );
});

Deno.test('a real Bucherer root follows the gallery and a duplicate root is kept once', () => {
  assertEquals(
    squarespacePhotoUrls({
      assetUrl: BUCHERER_ROOT,
      items: [{ assetUrl: BUCHERER_GALLERY }],
    }),
    [`${BUCHERER_GALLERY}?format=1500w`, `${BUCHERER_ROOT}?format=1500w`],
  );
  assertEquals(
    squarespacePhotoUrls({
      assetUrl: BUCHERER_GALLERY,
      items: [{ assetUrl: BUCHERER_GALLERY }],
    }),
    [`${BUCHERER_GALLERY}?format=1500w`],
  );
});

Deno.test('uses the sale price Squarespace displays', () => {
  assertEquals(
    squarespacePrice({
      structuredContent: {
        priceMoney: { currency: 'USD', value: '0.00' },
        variants: [
          {
            priceMoney: { currency: 'USD', value: '13000.00' },
            salePriceMoney: { currency: 'USD', value: '11950.00' },
            onSale: true,
            qtyInStock: 1,
          },
        ],
      },
    }),
    { priceCents: 1_195_000, currency: 'USD' }
  );
});

function attribute(value: unknown): string {
  return JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

Deno.test('a collection page is read from data-context and format=json is not requested', async () => {
  const record = {
    items: [
      {
        title: '1970 Omega Seamaster',
        id: 'omega-1',
        fullUrl: '/watches/p/omega',
        description: '<p>Steel seamaster.</p>',
        soldOut: false,
        price: { currency: 'USD', value: '1800.00' },
        images: [{ assetUrl: 'https://images.example/omega.jpg' }],
        variants: [{
          qtyInStock: 1,
          unlimited: false,
          price: { currency: 'USD', value: '1800.00' },
        }],
      },
      {
        title: 'Sold Cartier Tank',
        id: 'cartier-1',
        fullUrl: '/watches/p/tank',
        description: '<p>Gone.</p>',
        soldOut: true,
        price: { currency: 'USD', value: '4000.00' },
        images: [{ assetUrl: 'https://images.example/tank.jpg' }],
        variants: [{
          qtyInStock: 0,
          unlimited: false,
          soldOut: true,
          price: { currency: 'USD', value: '4000.00' },
        }],
      },
    ],
    pagination: { nextPage: false },
  };
  const html =
    `<!doctype html>Static.SQUARESPACE_CONTEXT = {};<div data-context="${attribute(record)}"></div>`;
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: 'User-agent: *\nAllow: /\nDisallow: /*?format=json\n' };
    }
    return { status: 200, body: html };
  };
  const read = await fetchSquarespaceItems('https://shop.example/watches', 10, 1, {
    fetchText,
    pause: async () => {},
  });
  assertEquals(calls.some((call) => call.includes('format=json')), false);
  assertEquals(read?.recognized, true);
  assertEquals(read?.complete, true);
  assertEquals(read?.items.map((item) => [item.title, item.available, item.priceCents]), [
    ['1970 Omega Seamaster', true, 180_000],
    ['Sold Cartier Tank', false, 400_000],
  ]);
  assertEquals(read?.items[0]?.photoUrls, ['https://images.example/omega.jpg?format=1500w']);
  assertEquals(squarespaceRecords(html).length, 1);
});

Deno.test('an older product list is read from the HTML grid, not format=json', async () => {
  const grid = `<!doctype html>Static.SQUARESPACE_CONTEXT = {"selectedCurrency":"USD"};
    <div id="productList">
      <a href="/under350/bulova" class="product hentry" data-item-id="item-1">
        <img data-image="https://images.example/bulova.jpg" />
        <div class="product-title">1960 Bulova Fancy</div>
        <div class="product-price">$435.00</div>
      </a>
      <a href="/under350/sold" class="product hentry sold-out" data-item-id="item-2">
        <img data-image="https://images.example/sold.jpg" />
        <div class="product-title">Sold Omega</div>
        <div class="product-price">$1,250.00</div>
      </a>
    </div>
    <!-- PAGINATION -->`;
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: 'User-agent: *\nAllow: /\nDisallow: /*?format=json\n' };
    }
    if (url.pathname === '/') {
      return { status: 200, body: '<!doctype html>Static.SQUARESPACE_CONTEXT = {};' };
    }
    if (url.pathname === '/sitemap.xml') {
      return {
        status: 200,
        body: '<urlset><loc>https://shop.example/under350/bulova</loc><loc>https://shop.example/cameras/leica</loc></urlset>',
      };
    }
    if (url.pathname === '/under350') return { status: 200, body: grid };
    throw new Error(`unexpected ${url.pathname}`);
  };
  const read = await fetchSquarespaceItems('https://shop.example/', 10, 1, {
    fetchText,
    pause: async () => {},
  });
  assertEquals(calls.some((call) => call.includes('format=json')), false);
  assertEquals(calls.includes('/cameras'), false);
  assertEquals(read?.complete, true);
  assertEquals(read?.items.map((item) => [item.title, item.available, item.priceCents]), [
    ['1960 Bulova Fancy', true, 43_500],
    ['Sold Omega', false, 125_000],
  ]);
  assertEquals(read?.items[0]?.photoUrls, ['https://images.example/bulova.jpg?format=1500w']);
  assertEquals(read?.items[0]?.externalId, 'squarespace:item-1');
});
