/**
 * Compare each approved shop's public feed with the catalogue.
 *
 *   npm run catalogue:audit
 *
 * Writes nothing. Exits 1 when a for-sale watch is missing, a catalogue row
 * is still for sale after the feed dropped it, or a listing was sold while
 * the feed still offers the watch. Squarespace homepages that are not a
 * product collection are the same class of failure.
 */

import { config, describeTarget, serviceKey } from './_supabase.mjs';

const UA = 'GrahamBot/0.1 (+https://graham.watch)';
const NOT_A_WATCH =
  /\b(straps?|bands?|bracelets?|buckles?|clasps?|links?|books?|magazines?|tools?|winders?|rolls?|pouch(es)?|boxes|cases?|services?|repairs?|polish\w*|parts?|movements?|dials?|crystals?|accessor\w*|sunglasses|eyewear|apparel|t-?shirts?|hats?|caps?|gift\s*cards?|signs?|posters?|prints?|art(work)?|decor|furniture|jewel\w*|rings?|cuff\s*links?|merch(andise)?|sculptures?|two[\s-]?piece|natos?)\b/i;

export function feedAvailable(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const stated = variants.filter((variant) => typeof variant.available === 'boolean');
  return stated.length === 0 || stated.some((variant) => variant.available === true);
}

export function feedKept(product) {
  const title = typeof product?.title === 'string' ? product.title.trim() : '';
  const handle = typeof product?.handle === 'string' ? product.handle : '';
  const photos = Array.isArray(product?.images) ? product.images.length : 0;
  const type = typeof product?.product_type === 'string' ? product.product_type : '';
  if (!title || !handle || photos === 0) return false;
  if (type && NOT_A_WATCH.test(type)) return false;
  return true;
}

/**
 * @param {Array<{ id: string, available: boolean, kept: boolean, handle: string }>} feed
 * @param {Array<{ externalId: string, available: boolean, hold: boolean, listingSoldMissing: boolean }>} stored
 */
export function diffFeed(feed, stored) {
  const storedById = new Map(stored.map((row) => [row.externalId, row]));
  const feedIds = new Set(feed.map((product) => product.id));
  let missedForSale = 0;
  let falseForSale = 0;
  let soldButFeedAvailable = 0;
  const missedExamples = [];
  const soldExamples = [];

  for (const product of feed) {
    const row = storedById.get(product.id);
    if (!row) {
      if (product.available && product.kept) {
        missedForSale += 1;
        if (missedExamples.length < 3) missedExamples.push(product.handle);
      }
      continue;
    }
    if (row.available && !row.hold && !product.available) falseForSale += 1;
    if (
      row.listingSoldMissing &&
      product.available &&
      product.kept
    ) {
      soldButFeedAvailable += 1;
      if (soldExamples.length < 3) soldExamples.push(product.handle);
    }
  }

  let storedForSaleMissingFromFeed = 0;
  for (const row of stored) {
    if (row.available && !row.hold && !feedIds.has(row.externalId)) {
      storedForSaleMissingFromFeed += 1;
    }
  }

  return {
    missedForSale,
    falseForSale,
    soldButFeedAvailable,
    storedForSaleMissingFromFeed,
    missedExamples,
    soldExamples,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAll(path) {
  const { url, anonKey } = config();
  const key = serviceKey();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${url}${path}`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${from + 999}`,
      },
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${path.split('?')[0]} ${(await response.text()).slice(0, 200)}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function shopifyFeed(website) {
  const base = new URL(website);
  const collection = base.pathname.match(/^\/collections\/([^/]+)/);
  const endpoint = new URL(
    collection ? `/collections/${collection[1]}/products.json` : '/products.json',
    base.origin
  );
  const products = [];
  for (let page = 1; page <= 40; page += 1) {
    const pageUrl = new URL(endpoint);
    pageUrl.searchParams.set('limit', '250');
    if (page > 1) pageUrl.searchParams.set('page', String(page));
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, status: response.status, products, complete: false };
    const body = await response.json();
    if (!Array.isArray(body.products)) return { ok: false, status: response.status, products, complete: false };
    products.push(...body.products);
    if (body.products.length < 250) return { ok: true, products, complete: true };
    await sleep(1000);
  }
  return { ok: true, products, complete: false };
}

async function squarespaceIsCollection(website) {
  const url = new URL(website);
  url.searchParams.set('format', 'json');
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) return { ok: false, status: response.status };
  const body = await response.json();
  const collection =
    Array.isArray(body.items) || body.item || body.collection?.typeName === 'products';
  return { ok: true, collection: Boolean(collection) };
}

function listingSoldMissing(listing) {
  return Boolean(listing?.sold_at) && listing.sold_source === 'missing_from_catalog';
}

async function main() {
  console.log(describeTarget());
  const dealers = await getAll(
    '/rest/v1/dealers?select=id,name,website&permission=eq.approved&order=name.asc'
  );
  const items = await getAll(
    '/rest/v1/source_items?select=dealer_id,external_id,available,hold_reason,listing_id'
  );
  const listings = await getAll('/rest/v1/listings?select=id,sold_at,sold_source');
  const listingById = new Map(listings.map((row) => [row.id, row]));
  const byDealer = new Map();
  for (const item of items) {
    const bucket = byDealer.get(item.dealer_id) ?? [];
    bucket.push(item);
    byDealer.set(item.dealer_id, bucket);
  }

  let problems = 0;
  for (const dealer of dealers) {
    const stored = (byDealer.get(dealer.id) ?? []).map((row) => ({
      externalId: row.external_id,
      available: Boolean(row.available),
      hold: Boolean(row.hold_reason),
      listingSoldMissing: listingSoldMissing(
        row.listing_id ? listingById.get(row.listing_id) : null
      ),
    }));
    const feed = await shopifyFeed(dealer.website);
    if (!feed.ok) {
      const page = await squarespaceIsCollection(dealer.website);
      const homepage = page.ok && !page.collection;
      if (homepage) problems += 1;
      console.log(
        JSON.stringify({
          name: dealer.name,
          feed: 'not-shopify',
          homepageIsNotACatalogue: homepage,
          stored: stored.length,
        })
      );
      continue;
    }

    const compared = diffFeed(
      feed.products
        .filter((product) => product.id != null)
        .map((product) => ({
          id: `shopify:${product.id}`,
          available: feedAvailable(product),
          kept: feedKept(product),
          handle: typeof product.handle === 'string' ? product.handle : String(product.id),
        })),
      stored.filter((row) => row.externalId.startsWith('shopify:'))
    );
    if (
      feed.complete &&
      (compared.missedForSale > 0 ||
        compared.soldButFeedAvailable > 0 ||
        compared.storedForSaleMissingFromFeed > 0)
    ) {
      problems += 1;
    }
    console.log(
      JSON.stringify({
        name: dealer.name,
        feedProducts: feed.products.length,
        feedComplete: feed.complete,
        stored: stored.length,
        ...compared,
      })
    );
  }

  if (problems > 0) {
    console.error(`${problems} shop(s) disagree with their feed.`);
    process.exitCode = 1;
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('catalogue-audit.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
