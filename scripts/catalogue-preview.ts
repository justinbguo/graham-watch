/**
 * Read-only catalogue preview for a Shopify shop.
 *
 *   deno run --allow-net --config supabase/functions/deno.ci.json \
 *     scripts/catalogue-preview.ts https://dannysvintagewatches.com
 *
 * Writes nothing. Waits the same second the importer waits, and sends
 * GrahamBot/0.1. Prints counts a person can compare with the shop, not the
 * watches themselves.
 */
import { MAX_CATALOG_ITEMS } from '../supabase/functions/import-listings/catalog.ts';
import { fetchShopifyItems } from '../supabase/functions/import-listings/shopify.ts';
import { fetchText } from '../supabase/functions/import-listings/source.ts';

const urls = Deno.args.length
  ? Deno.args
  : [
      'https://collectorscornerny.com',
      'https://www.craftandtailored.com',
      'https://dannysvintagewatches.com',
    ];

for (const sourceUrl of urls) {
  const started = Date.now();
  let requests = 0;
  const read = await fetchShopifyItems(sourceUrl, MAX_CATALOG_ITEMS, 0, {
    fetchText: async (url, accept) => {
      requests += 1;
      console.error(`  ${requests} ${url.pathname}${url.search}`);
      return fetchText(url, accept);
    },
  });

  if (!read) {
    console.log(`\n${sourceUrl}\n  not a Shopify catalogue\n`);
    continue;
  }

  const forSale = read.items.filter((item) => item.available);
  const publishable = forSale.filter((item) => item.photoUrls.length >= 3 && item.priceCents !== null);
  const reasons = new Map<string, number>();
  for (const skipped of read.skipped) {
    reasons.set(skipped.reason, (reasons.get(skipped.reason) ?? 0) + 1);
  }
  const types = new Map<string, number>();
  for (const item of forSale) {
    const type = item.meta?.productType ?? '(blank)';
    types.set(type, (types.get(type) ?? 0) + 1);
  }
  const shopNamed = forSale.filter((item) => {
    const vendor = item.meta?.vendor ?? '';
    return vendor && item.title.toLowerCase().includes(vendor.toLowerCase()) === false;
  });

  console.log(`\n${sourceUrl}`);
  console.log(`  complete: ${read.complete === true}`);
  console.log(`  requests: ${requests}`);
  console.log(`  kept: ${read.items.length}`);
  console.log(`  for sale: ${forSale.length}`);
  console.log(`  for sale with a price and at least 3 photos: ${publishable.length}`);
  console.log(`  sold: ${read.items.length - forSale.length}`);
  console.log(`  refused: ${read.skipped.length}`);
  console.log(`  seconds: ${((Date.now() - started) / 1000).toFixed(0)}`);
  if (reasons.size) {
    console.log('  refused because:');
    for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count}  ${reason}`);
    }
  }
  console.log('  for-sale product types:');
  for (const [type, count] of [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${count}  ${type}`);
  }
  const samples = forSale
    .filter((item) => item.meta?.vendor && foldLooksLikeShop(item.meta.vendor, sourceUrl))
    .slice(0, 5);
  if (samples.length) {
    console.log('  titles whose vendor is the shop (should not start with it):');
    for (const item of samples) {
      console.log(`    [${item.meta?.vendor}] ${item.title}`);
    }
  }
  if (shopNamed.length) {
    console.log(`  for-sale titles that do not contain their vendor: ${shopNamed.length}`);
  }
  const odd = forSale.filter((item) =>
    /\b(jewel\w*|necklace|earring|cufflink|sculpture|merch|strap)\b/i.test(
      `${item.title} ${item.meta?.productType ?? ''}`
    )
  );
  if (odd.length) {
    console.log(`  for-sale rows whose title or type looks like it is not a watch: ${odd.length}`);
    for (const item of odd.slice(0, 8)) {
      console.log(`    [${item.meta?.productType ?? 'blank'}] ${item.title}`);
    }
  }
}

/** Enough to spot a dealer name left on the front of a title. Not the importer's matcher. */
function foldLooksLikeShop(vendor: string, sourceUrl: string): boolean {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const folded = vendor.toLowerCase();
  if (host.includes('collectorscorner') && folded.includes('collectors')) return true;
  if (host.includes('craftandtailored') && folded.includes('craft')) return true;
  if (host.includes('dannysvintage') && folded.includes('danny')) return true;
  return false;
}
