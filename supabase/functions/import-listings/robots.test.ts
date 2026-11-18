import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import {
  CatalogueRefused,
  assertCrawlDelay,
  createPacer,
  parseRobots,
  policyFromRobotsResponse,
  robotsBodyIsHtml,
} from './robots.ts';
import { USER_AGENT } from './source.ts';

/**
 * The rules that matter from a current Shopify storefront robots.txt.
 * `*` allows the catalogue. Stacked collection filters and the cart are not
 * for us. The adsbot group is a different crawler.
 */
const SHOPIFY = `
User-agent: *
Allow: /
Disallow: /admin
Disallow: /cart/
Disallow: /recommendations/products
Disallow: /collections/*sort_by*
Disallow: /collections/*filter*&*filter*
Disallow: /*?*oseid=*

User-agent: adsbot-google
Disallow: /products.json
`;

function allows(path: string, body = SHOPIFY, agent = USER_AGENT): boolean {
  return parseRobots(body, agent).allows(new URL(path, 'https://shop.example'));
}

Deno.test('the Shopify catalogue feed is allowed, and the private paths are not', () => {
  assertEquals(allows('/products.json'), true);
  assertEquals(allows('/products.json?limit=250&page=2'), true);
  assertEquals(allows('/meta.json'), true);
  assertEquals(allows('/collections/inventory/products.json?limit=250'), true);
  assertEquals(allows('/admin'), false);
  assertEquals(allows('/cart/'), false);
  assertEquals(allows('/recommendations/products'), false);
  assertEquals(allows('/collections/watches?sort_by=best-selling'), false);
});

Deno.test('one availability filter is allowed and two stacked filters are not', () => {
  assertEquals(allows('/collections/all?filter.v.availability=1'), true);
  assertEquals(allows('/collections/all?filter.v.availability=1&filter.p.vendor=Rolex'), false);
});

Deno.test('the adsbot group does not apply to GrahamBot', () => {
  assertEquals(allows('/products.json'), true);
});

Deno.test('a group that names GrahamBot beats the star group', () => {
  const body = `
User-agent: *
Allow: /

User-agent: GrahamBot
Disallow: /products.json
`;
  assertEquals(allows('/products.json', body), false);
  assertEquals(allows('/pages/about', body), true);
});

Deno.test('an empty file and a missing rule allow the path', () => {
  assertEquals(allows('/products.json', ''), true);
  assertEquals(allows('/products.json', 'User-agent: *\n'), true);
});

Deno.test('a file with no user-agent line allows the site', () => {
  const body = `
Sitemap: https://shop.example/sitemap.xml
Disallow: /private
`;
  assertEquals(allows('/products.json', body), true);
  assertEquals(parseRobots(body, USER_AGENT).crawlDelayMs, null);
});

Deno.test('an HTML challenge served as robots.txt is refused', () => {
  assertEquals(robotsBodyIsHtml('<!DOCTYPE html><html></html>'), true);
  assertThrows(
    () => policyFromRobotsResponse(200, '<html><body>Checking your browser</body></html>'),
    CatalogueRefused,
  );
});

Deno.test('a crawl-delay over 5 seconds is a refusal', () => {
  assertThrows(() => assertCrawlDelay(10_000), CatalogueRefused);
  assertCrawlDelay(5_000);
  assertCrawlDelay(null);
});

Deno.test('a 10s crawl-delay fits a 20s budget and does not fit a 5s budget', async () => {
  const pauses: number[] = [];
  const pause = async (ms: number) => {
    pauses.push(ms);
  };
  const tooSlow = createPacer({
    crawlDelayMs: 10_000,
    floorMs: 1_000,
    budgetMs: 5_000,
    pause,
  });
  assertEquals(await tooSlow(), false);
  const fits = createPacer({
    crawlDelayMs: 10_000,
    floorMs: 1_000,
    budgetMs: 20_000,
    pause,
  });
  assertEquals(await fits(), true);
  assertEquals(pauses, [10_000]);
});

Deno.test('crawl-delay is read in milliseconds from the group that applies', () => {
  const body = `
User-agent: *
Crawl-delay: 2

User-agent: adsbot-google
Crawl-delay: 10
`;
  assertEquals(parseRobots(body, USER_AGENT).crawlDelayMs, 2_000);
});
