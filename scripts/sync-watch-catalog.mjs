/**
 * Pull the dials.co model list into public.watch_models.
 *
 *   npm run watch-catalog:sync
 *   npm run watch-catalog:sync -- --from-page 1 --to-page 5   # smoke test
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (local: `npm run db:start`, then sync).
 * ~42k models, 420 pages at 100/page — about ten minutes with polite pacing.
 */

import { config, describeTarget, serviceKey } from './_supabase.mjs';

const DIALS = 'https://api.dials.co/v1';
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 150;

const args = process.argv.slice(2);
const fromPage = readFlag(args, '--from-page', 1);
const toPage = readFlag(args, '--to-page', null);

function readFlag(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`${flag} needs a positive integer`);
    process.exit(1);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dials(path) {
  const response = await fetch(`${DIALS}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`dials.co ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function rowFrom(model) {
  if (!model?.id || !model?.brand?.slug || !model?.series?.slug || !model?.slug) {
    return null;
  }
  return {
    dials_id: model.id,
    brand_name: model.brand.name,
    brand_slug: model.brand.slug,
    series_name: model.series.name,
    series_slug: model.series.slug,
    name: model.name,
    reference_number: model.referenceNumber ?? null,
    model_slug: model.slug,
    thumbnail_url: model.thumbnailUrl ?? null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertBatch(rows) {
  const { url } = config();
  const key = serviceKey();
  const response = await fetch(`${url}/rest/v1/watch_models?on_conflict=dials_id`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`upsert failed ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function recordProgress({ page, totalPages, synced }) {
  const { url } = config();
  const key = serviceKey();
  const finished = page >= totalPages;
  const body = {
    models_synced: synced,
    last_page: page,
    total_pages: totalPages,
    finished_at: finished ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${url}/rest/v1/watch_catalog_sync?id=eq.1`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`progress update failed ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function main() {
  console.log(`Watch catalog sync → ${describeTarget()}`);

  const head = await dials(`/models?page=${fromPage}&pageSize=${PAGE_SIZE}`);
  const totalPages = head.totalPages ?? 1;
  const endPage = toPage == null ? totalPages : Math.min(toPage, totalPages);
  let synced = 0;

  for (let page = fromPage; page <= endPage; page += 1) {
    const payload =
      page === fromPage ? head : await dials(`/models?page=${page}&pageSize=${PAGE_SIZE}`);
    const rows = (payload.data ?? []).map(rowFrom).filter(Boolean);
    if (rows.length) {
      await upsertBatch(rows);
      synced += rows.length;
    }
    await recordProgress({ page, totalPages, synced });
    process.stdout.write(`\r  page ${page}/${endPage} · ${synced} models`);
    if (page < endPage) await sleep(PAGE_DELAY_MS);
  }

  process.stdout.write('\n');
  console.log(`Done. ${synced} models upserted (${fromPage}–${endPage} of ${totalPages} pages).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
