/**
 * Lists Squarespace no-image rows and the gallery photo that would become first.
 *
 * Dry run unless --write. --write refuses any host other than 127.0.0.1 or localhost.
 * Storage objects stay. Listing text, status, and price stay.
 *
 *   node scripts/repair-placeholder-photos.mjs
 *   node scripts/repair-placeholder-photos.mjs --write
 */

import { createHash } from 'node:crypto';

import { config, describeTarget } from './_supabase.mjs';

const PLACEHOLDER_SHA256 = '581af6bf6f105c917c6e7085911bae110d5326a72dd728499c14566f6e8b1269';
const HOSTED_REF = 'hbxgxtbtefpyutyqafoi';

function loopback(url) {
  try {
    const host = new URL(url).hostname;
    return (host === '127.0.0.1' || host === 'localhost') && !url.includes(HOSTED_REF);
  } catch {
    return false;
  }
}

function refuseRemoteWrite(url) {
  if (!loopback(url)) {
    throw new Error(
      `Refusing to write placeholder repairs on ${describeTarget()}. --write accepts only 127.0.0.1 or localhost.`,
    );
  }
}

async function rest(url, key, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}). ${await response.text()}`);
  }
  if (method === 'GET') return response.json();
  return null;
}

async function pages(url, key) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(
      `${url}/rest/v1/listing_photos?select=id,listing_id,position,source_url,storage_path&order=listing_id.asc,position.asc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + 999}`,
        },
      },
    );
    if (!response.ok) throw new Error(`Photo read failed (${response.status}). ${await response.text()}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

async function bytesOf(url, key, row) {
  const stored = row.storage_path
    ? `${url}/storage/v1/object/public/listing-photos/${row.storage_path}`
    : null;
  for (const target of [stored, row.source_url].filter(Boolean)) {
    try {
      const response = await fetch(target, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!response.ok) continue;
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      // The next URL is the dealer's own file.
    }
  }
  return null;
}

function planFor(listingId, rows) {
  const placeholders = rows.filter((row) => row.placeholder);
  if (!placeholders.length) return null;
  const keep = rows.filter((row) => !row.placeholder).sort((a, b) => a.position - b.position);
  return {
    listingId,
    remove: placeholders.map((row) => ({
      id: row.id,
      position: row.position,
      source_url: row.source_url,
      storage_path: row.storage_path,
    })),
    promote: keep[0]
      ? { id: keep[0].id, from: keep[0].position, to: 0, source_url: keep[0].source_url }
      : null,
    reorder: keep.map((row, index) => ({ id: row.id, from: row.position, to: index })),
  };
}

const write = process.argv.includes('--write');
const { url, serviceKey } = config();
if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
if (write) refuseRemoteWrite(url);

const photos = await pages(url, serviceKey);
const marked = [];
for (const row of photos) {
  const bytes = await bytesOf(url, serviceKey, row);
  const hash = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
  marked.push({ ...row, placeholder: hash === PLACEHOLDER_SHA256 });
}

const byListing = new Map();
for (const row of marked) {
  const group = byListing.get(row.listing_id) ?? [];
  group.push(row);
  byListing.set(row.listing_id, group);
}

const plans = [...byListing.entries()]
  .map(([listingId, rows]) => planFor(listingId, rows))
  .filter(Boolean);

const report = {
  dryRun: !write,
  target: describeTarget(),
  listings: plans.length,
  remove: plans.reduce((sum, plan) => sum + plan.remove.length, 0),
  plans,
};

if (!write) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

for (const plan of plans) {
  for (const row of plan.remove) {
    await rest(url, serviceKey, `/rest/v1/listing_photos?id=eq.${row.id}`, { method: 'DELETE' });
  }
  for (const row of plan.reorder) {
    if (row.from === row.to) continue;
    await rest(url, serviceKey, `/rest/v1/listing_photos?id=eq.${row.id}`, {
      method: 'PATCH',
      body: { position: row.to },
    });
  }
}

console.log(JSON.stringify({ ...report, dryRun: false, wrote: true }, null, 2));
