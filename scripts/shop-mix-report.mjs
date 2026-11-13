/**
 * How many shops the first screens of Buy and New show.
 *
 *   npm run report:shop-mix
 *
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from the environment, or from
 * .env.local (its EXPO_PUBLIC_ names count too). Calls rank_buy_feed as a
 * guest with no filter and no taste, and latest_catalogue_batch, then prints
 * the shops in the first 20 and the first 50 of each. Writes nothing.
 */

import { APP_LOCAL, hostOf, isLocalUrl, parseEnvFile } from './_env.mjs';

const SIZES = [20, 50];
const READ_ONLY_RPCS = new Set(['rank_buy_feed', 'latest_catalogue_batch']);

/** Watches per shop among the first `size` dealer ids, in first-seen order. */
export function shopCounts(dealerIds, size) {
  const counts = new Map();
  for (const id of dealerIds.slice(0, size)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function target() {
  const file = parseEnvFile(APP_LOCAL);
  const url = process.env.SUPABASE_URL ?? file.SUPABASE_URL ?? file.EXPO_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ?? file.SUPABASE_ANON_KEY ?? file.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(`Set SUPABASE_URL and SUPABASE_ANON_KEY, or put them in ${APP_LOCAL}.`);
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function read(project, path, init = {}) {
  const response = await fetch(`${project.url}${path}`, {
    ...init,
    headers: {
      apikey: project.key,
      Authorization: `Bearer ${project.key}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${path.split('?')[0]} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

function rpc(project, name, body) {
  if (!READ_ONLY_RPCS.has(name)) throw new Error(`${name} is not a read this report may call.`);
  return read(project, `/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

function select(project, table, columns, ids) {
  if (ids.length === 0) return [];
  return read(project, `/rest/v1/${table}?select=${columns}&id=in.(${ids.join(',')})`);
}

function printCounts(label, dealerIds, names) {
  console.log(`${label}: ${dealerIds.length} watches read`);
  for (const size of SIZES) {
    const counts = shopCounts(dealerIds, size);
    const shops = [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${names.get(id) ?? id} ${count}`)
      .join(', ');
    console.log(`  first ${size}: ${counts.size} shop(s)${shops ? `. ${shops}` : ''}`);
  }
}

async function main() {
  const project = target();
  if (isLocalUrl(project.url)) {
    console.log(`local · ${hostOf(project.url)}`);
  } else {
    console.log(`PRODUCTION · ${hostOf(project.url) ?? project.url}`);
    console.log('Read-only: two RPC reads and two selects with the anon key. Nothing is written.');
  }

  const buy = await rpc(project, 'rank_buy_feed', { p_spec: {}, p_limit: 50, p_cursor: null, p_seed: {} });
  const buyDealers = (buy ?? []).map((row) => row.listing.dealer_id);

  const batch = (await rpc(project, 'latest_catalogue_batch', {}))?.[0] ?? null;
  const newIds = (batch?.listing_ids ?? []).slice(0, Math.max(...SIZES));
  const newRows = await select(project, 'listings', 'id,dealer_id', newIds);
  const dealerOf = new Map(newRows.map((row) => [row.id, row.dealer_id]));
  const newDealers = newIds.map((id) => dealerOf.get(id)).filter(Boolean);

  const shopIds = [...new Set([...buyDealers, ...newDealers])];
  const shops = await select(project, 'dealers', 'id,name', shopIds);
  const names = new Map(shops.map((shop) => [shop.id, shop.name]));

  printCounts('Buy (guest, no filter)', buyDealers, names);
  if (!batch) {
    console.log('New: no batch has been sealed on this project.');
  } else {
    printCounts(`New (sealed ${batch.sealed_at}, ${batch.listing_ids.length} in batch)`, newDealers, names);
  }
}

const entry = process.argv[1] ?? '';
if (entry.endsWith('shop-mix-report.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
