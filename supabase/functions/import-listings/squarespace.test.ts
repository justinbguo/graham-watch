import { assertEquals } from 'jsr:@std/assert@1';

import type { SourceItem, TextResponse } from './source.ts';
import {
  fetchSquarespaceItems,
  hydrateSquarespaceItem,
  squarespaceCollectionPaths,
  squarespacePhotoUrls,
  squarespacePrice,
  squarespaceRecords,
  squarespaceSlideshowUrls,
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

const PRODUCT_PAGE = `<!doctype html>
  <script type="application/ld+json">{"@type":"Product","name":"1960 Bulova — Cool Vintage","image":"https://images.example/one.jpg","description":"A full description.","offers":{"price":"435","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>
  <div id="productSlideshow">
    <div class="slide" data-slide-index="1"><img data-src="https://images.example/one.jpg" data-image="https://images.example/one.jpg" /></div>
    <div class="slide" data-slide-index="2"><img data-image="https://images.example/two.jpg" /></div>
    <div class="slide" data-slide-index="3"><img data-image="https://images.example/three.jpg" /></div>
  </div>`;

Deno.test('the slideshow is the gallery when JSON-LD has one image', () => {
  assertEquals(squarespaceSlideshowUrls(PRODUCT_PAGE), [
    'https://images.example/one.jpg',
    'https://images.example/two.jpg',
    'https://images.example/three.jpg',
  ]);
});

Deno.test('a one-photo grid takes the product-page slideshow, after robots and a pause', async () => {
  const calls: string[] = [];
  const pauses: number[] = [];
  const grid: SourceItem = {
    externalId: 'squarespace:item-1',
    title: '1960 Bulova',
    text: '',
    sourceUrl: 'https://shop.example/under350/bulova',
    photoUrls: ['https://images.example/one.jpg?format=1500w'],
    priceCents: 43_500,
    currency: 'USD',
    available: true,
  };
  const hydrated = await hydrateSquarespaceItem(grid, {
    fetchText: async (url) => {
      calls.push(url.pathname);
      if (url.pathname === '/robots.txt') {
        return { status: 200, body: 'User-agent: *\nAllow: /\nDisallow: /*?format=json\n' };
      }
      return { status: 200, body: PRODUCT_PAGE };
    },
    pause: async (ms) => {
      pauses.push(ms);
    },
  });
  assertEquals(calls[0], '/robots.txt');
  assertEquals(calls.includes('/under350/bulova'), true);
  assertEquals(calls.some((call) => call.includes('format=json')), false);
  assertEquals(pauses.includes(1000), true);
  assertEquals(hydrated.photoUrls, [
    'https://images.example/one.jpg?format=1500w',
    'https://images.example/two.jpg?format=1500w',
    'https://images.example/three.jpg?format=1500w',
  ]);
  assertEquals(hydrated.text.includes('full description'), true);
});

Deno.test('a disallowed product page keeps the grid photos', async () => {
  const calls: string[] = [];
  const grid: SourceItem = {
    externalId: 'squarespace:item-1',
    title: '1960 Bulova',
    text: 'grid',
    sourceUrl: 'https://blocked.example/under350/bulova',
    photoUrls: ['https://images.example/one.jpg?format=1500w'],
    priceCents: 43_500,
    currency: 'USD',
    available: true,
  };
  const hydrated = await hydrateSquarespaceItem(grid, {
    fetchText: async (url) => {
      calls.push(url.pathname);
      return { status: 200, body: 'User-agent: *\nDisallow: /\n' };
    },
    pause: async () => {},
  });
  assertEquals(calls, ['/robots.txt']);
  assertEquals(hydrated.photoUrls.length, 1);
});

function windPage(fields: {
  title: string;
  prose: string;
  button?: string;
  price?: string;
  sku?: string;
}): string {
  const id = fields.sku ?? 'x';
  const photos = [1, 2, 3]
    .map((n) => `<img data-src="https://images.squarespace-cdn.com/content/v1/shop/${id}-${n}.jpg" />`)
    .join('')
    + `<img data-src="https://images.squarespace-cdn.com/content/v1/shop/${id}-1.jpg?format=300w" />`
    + `<img data-src="https://images.squarespace-cdn.com/content/v1/shop/favicon.ico" />`
    + `<img data-src="https://images.squarespace-cdn.com/content/v1/shop/logo.png" />`;
  const price = fields.price
    ? `<p>PRICE: ${fields.price}${fields.sku ? ` (Item ${fields.sku})` : ''}</p>`
    : fields.sku
      ? `<p>Item ${fields.sku}</p>`
      : '';
  const button = fields.button ? `<a data-sqsp-button href="mailto:desk@windvintage.com">${fields.button}</a>` : '';
  return `<!doctype html>Static.SQUARESPACE_CONTEXT = {};<title>${fields.title} — Wind Vintage</title><h1>${fields.title}</h1><p>${fields.prose}</p>${price}${photos}${button}`;
}

const WIND_HOME = `<!doctype html>Static.SQUARESPACE_CONTEXT = {};
  <h1><strong>Watches</strong></h1>
  <a
    href="https://www.windvintage.com/sale"
    class="image-slide-anchor"
  ></a>
  <a href="https://windvintage.com/pending" class="image-slide-anchor"></a>
  <a href="https://www.windvintage.com/sold" class="image-slide-anchor"></a>
  <a href="https://www.windvintage.com/kith" class="image-slide-anchor"></a>
  <a href="https://www.windvintage.com/bracelet" class="image-slide-anchor"></a>
  <a href="https://clickybezel.com/collections/wind" class="image-slide-anchor"></a>
  <div class="newsletter-form-header"></div>
  <a href="https://www.windvintage.com/press-clip" class="image-slide-anchor"></a>`;

const WIND_PAGES: Record<string, string> = {
  '/sale': windPage({
    title: 'Cartier Coin Watch',
    prose: 'We believe the watch dates to circa 1927.',
    button: '$29,000',
    price: '$29,000',
    sku: 'SBUXYT4008',
  }),
  '/pending': windPage({
    title: 'Rolex Submariner Reference 5513',
    prose: 'Running well.',
    button: 'SALE PENDING TO MR PORTER',
    price: '$21,000',
    sku: 'SBUXYT5457',
  }),
  '/sold': windPage({
    title: 'Heuer Autavia',
    prose: 'It has left the shop.',
    button: 'SOLD',
    sku: 'SBUXYT5190',
  }),
  '/kith': windPage({
    title: 'Rolex at Kith',
    prose: 'Ask the partner store.',
    button: 'J. Press.',
  }),
  '/bracelet': windPage({
    title: '16mm Gay Freres Stretch Rivet 5.25 inches 1958',
    prose: 'This stretch rivet bracelet was made by Gay Freres.',
    button: '$1,900',
    price: '$1,900',
    sku: 'SBUXYT3475',
  }),
};

Deno.test('Wind Vintage pages supply price, stock, photos, and a held bracelet', async () => {
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(`${url.hostname}${url.pathname}${url.search}`);
    if (url.hostname.includes('clicky')) throw new Error('off-host fetch');
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: 'User-agent: *\nAllow: /\nDisallow: /*?format=json\n' };
    }
    if (url.pathname === '/' || url.pathname === '') return { status: 200, body: WIND_HOME };
    const body = WIND_PAGES[url.pathname];
    if (!body) throw new Error(`unexpected ${url.pathname}`);
    return { status: 200, body };
  };
  const read = await fetchSquarespaceItems('https://www.windvintage.com/', 10, 3, {
    fetchText,
    pause: async () => {},
    maxPages: 1,
  });
  assertEquals(calls.some((call) => call.includes('format=json')), false);
  assertEquals(calls.some((call) => call.includes('sitemap')), false);
  assertEquals(calls.some((call) => call.includes('clicky') || call.includes('press-clip')), false);
  assertEquals(calls.includes('www.windvintage.com/pending'), true);
  assertEquals(calls.some((call) => call.startsWith('windvintage.com/')), false);
  assertEquals(read?.complete, true);
  assertEquals(read?.nextPage, undefined);
  const byPath = new Map(read?.items.map((item) => [new URL(item.sourceUrl).pathname, item]));
  const sale = byPath.get('/sale');
  assertEquals(sale?.available, true);
  assertEquals(sale?.priceCents, 2_900_000);
  assertEquals(sale?.externalId, 'squarespace:SBUXYT4008');
  assertEquals(sale?.photoUrls.length, 3);
  assertEquals(sale?.photoUrls.every((url) => url.includes('format=1500w')), true);
  assertEquals(sale?.photoUrls.some((url) => /favicon|logo/i.test(url)), false);
  assertEquals(sale?.text.includes('1927'), true);
  assertEquals(sale?.holdReason, undefined);
  const pending = byPath.get('/pending');
  assertEquals(pending?.available, false);
  assertEquals(pending?.priceCents, 2_100_000);
  assertEquals(read?.skipped.some((row) => row.sourceUrl.endsWith('/pending')), false);
  const sold = byPath.get('/sold');
  assertEquals(sold?.available, false);
  assertEquals(sold?.priceCents, null);
  assertEquals(read?.skipped.some((row) => row.sourceUrl.endsWith('/sold')), false);
  assertEquals(byPath.has('/kith'), false);
  assertEquals(read?.skipped.some((row) => row.reason === 'no price' && row.title === 'Rolex at Kith'), true);
  assertEquals(byPath.get('/bracelet')?.holdReason, 'strap');
  assertEquals(byPath.get('/bracelet')?.available, true);

  const opened = await fetchSquarespaceItems('https://www.windvintage.com/', 1, 3, {
    fetchText,
    pause: async () => {},
    maxPages: 1,
  });
  assertEquals(opened?.complete, false);
  assertEquals(opened?.nextPage, 2);
  assertEquals(opened?.items.map((item) => new URL(item.sourceUrl).pathname), ['/sale']);
  const rest = await fetchSquarespaceItems('https://www.windvintage.com/', 10, 3, {
    fetchText,
    pause: async () => {},
    startPage: opened?.nextPage,
  });
  assertEquals(rest?.items.some((item) => item.externalId === 'squarespace:SBUXYT4008'), false);
  assertEquals(rest?.complete, true);
  assertEquals(rest?.nextPage, undefined);
});

Deno.test('a dollar button prices a Wind Vintage page when the PRICE line has no amount', async () => {
  const home = `<!doctype html>Static.SQUARESPACE_CONTEXT = {};
    <h1>Watches</h1>
    <a href="/button-only" class="image-slide-anchor"></a>
    <a href="/ask" class="image-slide-anchor"></a>
    <div class="newsletter-block"></div>`;
  const pages: Record<string, string> = {
    '/button-only':
      '<!doctype html><h1>Rolex Datejust</h1><p>Steel.</p><img data-src="https://images.squarespace-cdn.com/content/v1/shop/a.jpg" /><a data-sqsp-button>$23,900</a>',
    '/ask':
      '<!doctype html><h1>Patek Essay</h1><p>PRICE: upon request</p><img data-src="https://images.squarespace-cdn.com/content/v1/shop/b.jpg" /><a data-sqsp-button>$23,900</a>',
  };
  const read = await fetchSquarespaceItems('https://windvintage.com/press', 10, 0, {
    fetchText: async (url) => {
      if (url.pathname === '/robots.txt') {
        return { status: 200, body: 'User-agent: *\nAllow: /\nDisallow: /*?format=json\n' };
      }
      if (url.pathname === '/') return { status: 200, body: home };
      const body = pages[url.pathname];
      if (!body) throw new Error(url.pathname);
      return { status: 200, body };
    },
    pause: async () => {},
    maxPages: 1,
  });
  assertEquals(read?.items.map((item) => [item.title, item.priceCents, item.available]), [
    ['Rolex Datejust', 2_390_000, true],
    ['Patek Essay', 2_390_000, true],
  ]);
  assertEquals(read?.skipped, []);
});

Deno.test('an empty Wind Vintage grid does not retire the shop', async () => {
  const read = await fetchSquarespaceItems('https://www.windvintage.com/', 10, 0, {
    fetchText: async (url) => {
      if (url.pathname === '/robots.txt') {
        return { status: 200, body: 'User-agent: *\nAllow: /\n' };
      }
      return {
        status: 200,
        body: '<!doctype html>Static.SQUARESPACE_CONTEXT = {};<h1>Watches</h1><div class="newsletter-block"></div>',
      };
    },
    pause: async () => {},
  });
  assertEquals(read?.recognized, true);
  assertEquals(read?.complete, false);
  assertEquals(read?.items, []);
});

Deno.test('a Wind Vintage page that does not answer leaves the read unfinished', async () => {
  const home = `<!doctype html>Static.SQUARESPACE_CONTEXT = {};
    <h1>Watches</h1>
    <a href="/gone" class="image-slide-anchor"></a>
    <a href="/sale" class="image-slide-anchor"></a>
    <div class="newsletter-block"></div>`;
  const read = await fetchSquarespaceItems('https://www.windvintage.com/', 10, 0, {
    fetchText: async (url) => {
      if (url.pathname === '/robots.txt') return { status: 200, body: 'User-agent: *\nAllow: /\n' };
      if (url.pathname === '/') return { status: 200, body: home };
      if (url.pathname === '/gone') return { status: 404, body: 'missing' };
      return {
        status: 200,
        body: '<h1>Omega</h1><p>PRICE: $4,000 (Item SBUXYT1)</p><a data-sqsp-button>$4,000</a>',
      };
    },
    pause: async () => {},
  });
  assertEquals(read?.complete, false);
  assertEquals(read?.items.map((item) => item.title), ['Omega']);
  assertEquals(read?.skipped.some((row) => row.reason === 'product page did not answer'), true);
});
