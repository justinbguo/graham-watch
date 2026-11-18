import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { CatalogueRefused } from './robots.ts';
import type { TextResponse } from './source.ts';
import { fetchWixItems, wixInStock } from './wix.ts';

const SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://shop.example/product-page/omega-seamaster</loc></url>
  <url><loc>https://shop.example/product-page/sold-strap</loc></url>
  <url><loc>https://shop.example/about</loc></url>
</urlset>`;

function product(name: string, price: string, availability: string): string {
  const data = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name,
    description: `${name} on a steel bracelet.`,
    image: [{
      '@type': 'ImageObject',
      contentUrl: 'https://static.wixstatic.com/media/watch.jpg/v1/fit/w_500,h_500,q_90/file.jpg',
    }],
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price,
      availability,
    },
  };
  return `<!doctype html><script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

Deno.test('out of stock JSON-LD is not live', () => {
  assertEquals(wixInStock({ availability: 'https://schema.org/OutOfStock' }), false);
  assertEquals(wixInStock({ availability: 'https://schema.org/InStock' }), true);
  assertEquals(wixInStock(null), true);
});

Deno.test('the sitemap lists product pages and JSON-LD supplies price and stock', async () => {
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(url.pathname);
    if (url.pathname === '/robots.txt') {
      return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    }
    if (url.pathname === '/store-products-sitemap.xml') {
      return { status: 200, body: SITEMAP };
    }
    if (url.pathname.endsWith('/sold-strap')) {
      return {
        status: 200,
        body: product('Vintage strap pamphlet', '25', 'https://schema.org/InStock'),
      };
    }
    return {
      status: 200,
      body: product('1968 Omega Seamaster', '1800', 'https://schema.org/InStock'),
    };
  };
  const read = await fetchWixItems('https://shop.example', 10, 1, {
    fetchText,
    pause: async () => {},
    maxPages: 10,
  });
  assertEquals(read?.recognized, true);
  assertEquals(read?.complete, true);
  assertEquals(calls.includes('/about'), false);
  const watch = read?.items.find((item) => item.title.startsWith('1968'));
  assertEquals(watch?.available, true);
  assertEquals(watch?.priceCents, 180_000);
  assertEquals(watch?.currency, 'USD');
  assertEquals(
    watch?.photoUrls[0],
    'https://static.wixstatic.com/media/watch.jpg/v1/fit/w_1500,h_1500,q_90/file.jpg',
  );
  const held = read?.items.find((item) => item.title.includes('pamphlet'));
  assertEquals(held?.holdReason === 'strap' || held?.holdReason === 'not_a_watch' || held?.holdReason === 'accessory', true);
});

Deno.test('a crawl-delay that does not fit skips the sitemap', async () => {
  const calls: string[] = [];
  const fetchText = async (url: URL): Promise<TextResponse> => {
    calls.push(url.pathname);
    return { status: 200, body: 'User-agent: *\nCrawl-delay: 10\nAllow: /\n' };
  };
  await assertRejects(
    () =>
      fetchWixItems('https://shop.example', 10, 1, {
        fetchText,
        pause: async () => {},
        budgetMs: 2_000,
      }),
    CatalogueRefused,
  );
  assertEquals(calls, ['/robots.txt']);
});

Deno.test('a pocket watch on a Wix product page is held', async () => {
  const name = '1914 Vacheron Constantin for Merimont Mens Art Deco 44mm Pocket Watch Platinum';
  const fetchText = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    if (url.pathname === '/store-products-sitemap.xml') {
      return {
        status: 200,
        body: '<?xml version="1.0"?><urlset><url><loc>https://shop.example/product-page/vacheron</loc></url></urlset>',
      };
    }
    return { status: 200, body: product(name, '14000', 'https://schema.org/InStock') };
  };
  const read = await fetchWixItems('https://shop.example', 5, 1, {
    fetchText,
    pause: async () => {},
  });
  assertEquals(read?.items[0]?.holdReason, 'not_a_watch');
  assertEquals(read?.items[0]?.title, name);
});

Deno.test('a shop without the Wix sitemap is not Wix', async () => {
  const fetchText = async (url: URL): Promise<TextResponse> => {
    if (url.pathname === '/robots.txt') return { status: 200, body: 'User-agent: *\nAllow: /\n' };
    return { status: 404, body: '' };
  };
  assertEquals(
    await fetchWixItems('https://shop.example', 10, 1, { fetchText, pause: async () => {} }),
    null,
  );
});
