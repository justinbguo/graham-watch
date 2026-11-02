/**
 * v2 search, v2 counts, v1, and matchesListing are one filter.
 *
 * listing_matches is the only SQL predicate. search_listings_v2 and
 * listing_counts_v2 both call it, and the rows they return are the rows v1
 * returns and the rows the shop page would keep. Keyset pages cover every
 * matching watch once, including when a watch is inserted mid-scroll.
 *
 * Needs the local stack (`npm run db:start`). Refuses a hosted URL: the
 * fixtures are real inserts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { matchesListing } from '../src/features/filters/match.ts';
import { canonicalize } from '../src/features/filters/spec.ts';
import { NO_FILTERS, toRpcArgs } from '../src/features/filters/types.ts';
import { config, serviceKey } from './_supabase.mjs';

const MIGRATION = new URL(
  '../supabase/migrations/20261102000001_listing_matches.sql',
  import.meta.url,
);

test('v2 search and counts call listing_matches, and v1 is not replaced', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /create function public\.listing_matches\(/);
  assert.match(sql, /create function public\.search_listings_v2\(/);
  assert.match(sql, /create function public\.listing_counts_v2\(/);
  const search = sql.slice(sql.indexOf('create function public.search_listings_v2'));
  const counts = sql.slice(sql.indexOf('create function public.listing_counts_v2'));
  assert.match(search, /public\.listing_matches\(/);
  assert.match(counts, /public\.listing_matches\(/);
  assert.doesNotMatch(sql, /function public\.search_listings\(/);
  assert.doesNotMatch(sql, /function public\.listing_counts\(/);
});

function asFilters(spec) {
  return {
    ...NO_FILTERS,
    ...spec,
    query: spec.query ?? '',
    brands: spec.brands ?? [],
    dealers: spec.dealers ?? [],
    styles: spec.styles ?? [],
    materials: spec.materials ?? [],
    windings: spec.windings ?? [],
    complications: spec.complications ?? [],
    prices: spec.prices ?? [],
    sizes: spec.sizes ?? [],
    eras: spec.eras ?? [],
  };
}

function asCard(row) {
  return {
    ...row,
    photos: [],
    dealer: null,
    complications: row.complications ?? [],
    price_cents: row.price_cents == null ? null : Number(row.price_cents),
    case_size_mm: row.case_size_mm == null ? null : Number(row.case_size_mm),
    year: row.year == null ? null : Number(row.year),
  };
}

function sorted(ids) {
  return [...ids].sort();
}

let url;
let anon;
let service;
let buyer;

async function api(path, { token = anon, method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

async function createUser(email) {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: 'password123', email_confirm: true }),
  });
  if (!created.ok && created.status !== 422) {
    throw new Error(`create user failed: ${created.status} ${await created.text()}`);
  }
  const session = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
  if (!session.body?.access_token) {
    throw new Error(`sign-in failed for ${email}: ${JSON.stringify(session.body)}`);
  }
  return { token: session.body.access_token, id: session.body.user.id };
}

async function insertDealer(fields) {
  const res = await api('/rest/v1/dealers?select=id,permission,claimed_by', {
    token: service,
    method: 'POST',
    prefer: 'return=representation',
    body: fields,
  });
  if (res.status !== 201) throw new Error(`dealer insert: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body[0];
}

async function insertListing(fields) {
  const res = await api('/rest/v1/listings?select=*', {
    token: service,
    method: 'POST',
    prefer: 'return=representation',
    body: fields,
  });
  if (res.status !== 201) throw new Error(`listing insert: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body[0];
}

function rpcBodyError(name, res) {
  return `${name} ${res.status} ${JSON.stringify(res.body)}`;
}

async function searchV1(filters, options = {}) {
  const res = await api('/rest/v1/rpc/search_listings', {
    token: options.token ?? anon,
    method: 'POST',
    body: {
      p_limit: options.limit ?? 50,
      p_offset: options.offset ?? 0,
      p_exclude_swiped: options.excludeSwiped ?? false,
      p_exclude_own: options.excludeOwn ?? false,
      p_sort: options.sort ?? 'newest',
      p_favorites_first: options.favoritesFirst ?? false,
      ...toRpcArgs(filters),
    },
  });
  if (!res.ok) throw new Error(rpcBodyError('search_listings', res));
  return res.body ?? [];
}

async function searchV2(spec, options = {}) {
  const res = await api('/rest/v1/rpc/search_listings_v2', {
    token: options.token ?? anon,
    method: 'POST',
    body: {
      p_spec: spec,
      p_limit: options.limit ?? 50,
      p_cursor: options.cursor ?? null,
      p_exclude_swiped: options.excludeSwiped ?? false,
      p_exclude_own: options.excludeOwn ?? false,
      p_sort: options.sort ?? 'newest',
      p_favorites_first: options.favoritesFirst ?? false,
    },
  });
  if (!res.ok) throw new Error(rpcBodyError('search_listings_v2', res));
  return res.body ?? [];
}

async function pageV2(spec, options = {}) {
  const rows = [];
  let cursor = null;
  const seen = new Set();
  for (;;) {
    const page = await searchV2(spec, { ...options, cursor });
    if (page.length === 0) {
      assert.equal(cursor, null);
      break;
    }
    const next = page[0].cursor;
    assert.ok(page.every((row) => row.cursor === next), 'cursor differs within a page');
    assert.ok(page.every((row) => row.listing?.id), 'v2 row is missing its listing');
    rows.push(...page);
    if (next == null) break;
    assert.equal(seen.has(next), false, 'cursor repeated');
    seen.add(next);
    cursor = next;
    if (rows.length > 5000) throw new Error('paging did not end');
  }
  const ids = rows.map((row) => row.listing.id);
  assert.equal(new Set(ids).size, ids.length, 'keyset page repeated a row');
  return rows;
}

async function counts(which, filtersOrSpec, options = {}) {
  const v2 = which === 'v2';
  const res = await api(v2 ? '/rest/v1/rpc/listing_counts_v2' : '/rest/v1/rpc/listing_counts', {
    token: options.token ?? anon,
    method: 'POST',
    body: v2
      ? {
          p_spec: filtersOrSpec,
          p_exclude_swiped: options.excludeSwiped ?? false,
          p_exclude_own: options.excludeOwn ?? false,
        }
      : {
          ...toRpcArgs(filtersOrSpec),
          p_exclude_swiped: options.excludeSwiped ?? false,
          p_exclude_own: options.excludeOwn ?? false,
        },
  });
  if (!res.ok) throw new Error(rpcBodyError(v2 ? 'listing_counts_v2' : 'listing_counts', res));
  return {
    matched: Number(res.body?.[0]?.matched),
    total: Number(res.body?.[0]?.total),
  };
}

const stamp = Date.now();
const dealers = {};
const rows = {};
let universe = [];

function spec(extra = {}) {
  return canonicalize({ dealers: [dealers.a.id, dealers.b.id], ...extra }).spec;
}

function filtersOf(extra = {}) {
  return asFilters(spec(extra));
}

test.before(async () => {
  const cfg = config();
  if (!cfg.isLocal) {
    throw new Error(`Refusing to write fixtures to ${cfg.url}`);
  }
  url = cfg.url;
  anon = cfg.anonKey;
  service = serviceKey();
  buyer = await createUser(`filter-contract-${stamp}@example.com`);

  dealers.a = await insertDealer({
    name: `Contract A ${stamp}`,
    website: `https://contract-a-${stamp}.test`,
    permission: 'approved',
    created_by: buyer.id,
  });
  dealers.b = await insertDealer({
    name: `Contract B ${stamp}`,
    website: `https://contract-b-${stamp}.test`,
    permission: 'approved',
    created_by: buyer.id,
  });
  dealers.pending = await insertDealer({
    name: `Contract Pending ${stamp}`,
    website: `https://contract-pending-${stamp}.test`,
    permission: 'pending',
    created_by: buyer.id,
  });
  dealers.paused = await insertDealer({
    name: `Contract Paused ${stamp}`,
    website: `https://contract-paused-${stamp}.test`,
    permission: 'paused',
    created_by: buyer.id,
  });
  dealers.claimed = await insertDealer({
    name: `Contract Claimed ${stamp}`,
    website: `https://contract-claimed-${stamp}.test`,
    permission: 'approved',
    created_by: buyer.id,
    claimed_by: buyer.id,
  });
  dealers.page = await insertDealer({
    name: `Contract Page ${stamp}`,
    website: `https://contract-page-${stamp}.test`,
    permission: 'approved',
    created_by: buyer.id,
  });
  dealers.sort = await insertDealer({
    name: `Contract Sort ${stamp}`,
    website: `https://contract-sort-${stamp}.test`,
    permission: 'approved',
    created_by: buyer.id,
  });

  const base = {
    imported_by: buyer.id,
    currency: 'USD',
  };
  const at = (n) => `2020-06-01T00:00:${String(n).padStart(2, '0')}.000000Z`;

  rows.sub = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Rolex',
    model: 'Submariner',
    reference: '5513',
    style: 'diver',
    case_material: 'steel',
    winding: 'automatic',
    complications: ['date'],
    price_cents: 800_000,
    case_size_mm: 40,
    year: 1968,
    created_at: at(1),
  });
  rows.tudor = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Tudor',
    model: 'Oyster',
    reference: '7909',
    style: 'dress',
    case_material: 'steel',
    winding: 'manual',
    complications: [],
    price_cents: 400_000,
    case_size_mm: 34,
    year: 1950,
    created_at: at(2),
  });
  rows.tank = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Cartier',
    model: 'Tank',
    reference: '100',
    style: 'dress',
    case_material: 'yellow_gold',
    winding: 'manual',
    complications: [],
    price_cents: 2_000_000,
    case_size_mm: 25,
    year: 1949,
    created_at: at(3),
  });
  rows.speedy = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Omega',
    model: 'Speedmaster',
    reference: '145.012',
    style: 'chronograph',
    case_material: 'steel',
    winding: 'manual',
    complications: ['chronograph'],
    price_cents: 1_200_000,
    case_size_mm: 38,
    year: 1969,
    created_at: at(4),
  });
  rows.moon = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Omega',
    model: 'Moonwatch',
    reference: '145.022',
    style: 'chronograph',
    case_material: 'steel',
    winding: 'manual',
    complications: ['chronograph', 'date'],
    price_cents: 1_300_000,
    case_size_mm: 38,
    year: 1969,
    created_at: at(5),
  });
  rows.patek = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Patek',
    model: 'Calatrava',
    reference: '3940',
    style: 'dress',
    case_material: 'rose_gold',
    winding: 'automatic',
    complications: ['perpetual_calendar', 'moonphase'],
    price_cents: 6_000_000,
    case_size_mm: 39,
    year: 1980,
    created_at: at(6),
  });
  rows.explorer = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Rolex',
    model: 'Explorer',
    reference: '1016',
    style: 'diver',
    case_material: 'steel',
    winding: 'automatic',
    complications: ['date'],
    price_cents: null,
    case_size_mm: 36,
    year: 1970,
    created_at: at(7),
  });
  rows.rail = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Omega',
    model: 'Railmaster',
    reference: null,
    style: 'field',
    case_material: 'titanium',
    winding: 'automatic',
    complications: [],
    price_cents: 300_000,
    case_size_mm: null,
    year: null,
    created_at: at(8),
  });
  rows.edge5k = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Rolex',
    model: 'Datejust',
    reference: '1601',
    style: 'dress',
    case_material: 'steel',
    winding: 'automatic',
    complications: ['date'],
    price_cents: 500_000,
    case_size_mm: 36,
    year: 1979,
    created_at: at(9),
  });
  rows.edge50k = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Rolex',
    model: 'Daytona',
    reference: '6263',
    style: 'chronograph',
    case_material: 'steel',
    winding: 'manual',
    complications: ['chronograph'],
    price_cents: 5_000_000,
    case_size_mm: 37,
    year: 1965,
    created_at: at(10),
  });
  rows.unstyled = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Universal',
    model: 'Unstyled',
    reference: '1',
    style: null,
    case_material: 'steel',
    winding: 'manual',
    complications: [],
    price_cents: 100_000,
    case_size_mm: 32,
    year: 1962,
    created_at: at(11),
  });
  rows.gmt = await insertListing({
    ...base,
    dealer_id: dealers.b.id,
    brand: 'Rolex',
    model: 'GMT-Master',
    reference: '1675',
    style: 'diver',
    case_material: 'steel',
    winding: 'automatic',
    complications: ['gmt'],
    price_cents: 450_000,
    case_size_mm: 37,
    year: 1979,
    created_at: at(12),
  });
  rows.hidden = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Rolex',
    model: 'Hidden',
    reference: `kq7-hidden-${stamp}`,
    status: 'hidden',
    price_cents: 100,
    created_at: at(13),
  });
  rows.sold = await insertListing({
    ...base,
    dealer_id: dealers.a.id,
    brand: 'Rolex',
    model: 'Sold',
    reference: `kq7-sold-${stamp}`,
    sold_at: '2024-01-01T00:00:00Z',
    price_cents: 100,
    created_at: at(14),
  });
  rows.pending = await insertListing({
    ...base,
    dealer_id: dealers.pending.id,
    brand: 'Rolex',
    model: 'Pending',
    reference: `kq7-pending-${stamp}`,
    price_cents: 100,
    created_at: at(15),
  });
  rows.paused = await insertListing({
    ...base,
    dealer_id: dealers.paused.id,
    brand: 'Rolex',
    model: 'Paused',
    reference: `kq7-paused-${stamp}`,
    price_cents: 100,
    created_at: at(16),
  });
  rows.claimed = await insertListing({
    ...base,
    dealer_id: dealers.claimed.id,
    brand: 'Rolex',
    model: 'Datejust',
    reference: `kq7-claimed-${stamp}`,
    style: 'dress',
    case_material: 'steel',
    winding: 'manual',
    price_cents: 900_000,
    case_size_mm: 36,
    year: 1982,
    created_at: at(17),
  });

  universe = [
    rows.sub,
    rows.tudor,
    rows.tank,
    rows.speedy,
    rows.moon,
    rows.patek,
    rows.explorer,
    rows.rail,
    rows.edge5k,
    rows.edge50k,
    rows.unstyled,
    rows.gmt,
  ];
});

test.after(async () => {
  if (!url || !service) return;
  const ids = Object.values(dealers)
    .map((dealer) => dealer?.id)
    .filter(Boolean);
  if (ids.length) {
    await api(`/rest/v1/dealers?id=in.(${ids.join(',')})`, { token: service, method: 'DELETE' });
  }
  if (buyer?.id) {
    await fetch(`${url}/auth/v1/admin/users/${buyer.id}`, {
      method: 'DELETE',
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    });
  }
});

async function assertParity(extra, { explicit } = {}) {
  const canonical = spec(extra);
  const filters = asFilters(canonical);
  const expected = universe.filter((row) => matchesListing(asCard(row), filters)).map((row) => row.id);
  const v1 = await searchV1(filters);
  const v2 = await pageV2(canonical, { limit: 3 });
  const c1 = await counts('v1', filters);
  const c2 = await counts('v2', canonical);
  assert.deepEqual(
    sorted(v1.map((row) => row.id)),
    sorted(expected),
    `v1 disagreed with matchesListing for ${JSON.stringify(canonical)} v1=${JSON.stringify(
      v1.map((row) => ({
        id: row.id,
        brand: row.brand,
        model: row.model,
        reference: row.reference,
        dealer_id: row.dealer_id,
      })),
    )}`,
  );
  assert.deepEqual(
    sorted(v2.map((row) => row.listing.id)),
    sorted(expected),
    `v2 disagreed with matchesListing for ${JSON.stringify(canonical)} v2=${JSON.stringify(
      v2.map((row) => ({
        id: row.listing.id,
        brand: row.listing.brand,
        model: row.listing.model,
        reference: row.listing.reference,
        dealer_id: row.listing.dealer_id,
      })),
    )}`,
  );
  assert.equal(c1.matched, expected.length);
  assert.equal(c2.matched, expected.length);
  assert.equal(c1.total, c2.total);
  assert.equal(v2.length, c2.matched);
  if (explicit) {
    const got = new Set(v2.map((row) => row.listing.id));
    for (const id of explicit.yes) assert.equal(got.has(id), true, id);
    for (const id of explicit.no) assert.equal(got.has(id), false, id);
  }
}

test('empty and default specs match the same watches', async () => {
  const full = await pageV2(spec());
  const blank = await pageV2(spec({ query: '   ', brands: [], prices: [], sizes: [], eras: [] }));
  const omitted = await pageV2({ dealers: [dealers.a.id, dealers.b.id] });
  assert.deepEqual(
    sorted(full.map((row) => row.listing.id)),
    sorted(universe.map((row) => row.id)),
  );
  assert.deepEqual(
    sorted(blank.map((row) => row.listing.id)),
    sorted(full.map((row) => row.listing.id)),
  );
  assert.deepEqual(
    sorted(omitted.map((row) => row.listing.id)),
    sorted(full.map((row) => row.listing.id)),
  );
  await assertParity({});
});

test('multi-band price keeps the gap and the open ends', async () => {
  await assertParity(
    {
      prices: [
        { min: null, max: 500_000 },
        { min: 1_500_000, max: 5_000_000 },
      ],
    },
    {
      explicit: {
        yes: [rows.tudor.id, rows.gmt.id, rows.rail.id, rows.edge5k.id, rows.tank.id, rows.edge50k.id, rows.unstyled.id],
        no: [rows.sub.id, rows.speedy.id, rows.moon.id, rows.patek.id, rows.explorer.id],
      },
    },
  );
  // A typed band, not a preset. 1.2m and 1.3m are in; 800k and 2m are not.
  await assertParity(
    { prices: [{ min: 1_000_000, max: 1_500_000 }] },
    { explicit: { yes: [rows.speedy.id, rows.moon.id], no: [rows.sub.id, rows.tank.id] } },
  );
});

test('brands, dealers, style, material, winding, and complications', async () => {
  await assertParity({ brands: ['tudor', 'cartier'] }, {
    explicit: { yes: [rows.tudor.id, rows.tank.id], no: [rows.sub.id] },
  });
  await assertParity({ dealers: [dealers.b.id] }, {
    explicit: { yes: [rows.gmt.id], no: [rows.sub.id, rows.tudor.id] },
  });
  await assertParity({ styles: ['dress', 'diver'] });
  await assertParity({ styles: ['dress'] }, {
    explicit: { yes: [rows.tank.id], no: [rows.unstyled.id, rows.sub.id] },
  });
  await assertParity({ materials: ['yellow_gold'] }, {
    explicit: { yes: [rows.tank.id], no: [rows.sub.id, rows.patek.id] },
  });
  await assertParity({ windings: ['manual'] });
  await assertParity({ complications: ['chronograph'] }, {
    explicit: { yes: [rows.speedy.id, rows.moon.id, rows.edge50k.id], no: [rows.sub.id] },
  });
  await assertParity({ complications: ['chronograph', 'date'] }, {
    explicit: { yes: [rows.moon.id], no: [rows.speedy.id, rows.edge50k.id] },
  });
  await assertParity(
    {
      brands: ['rolex'],
      styles: ['diver'],
      prices: [{ min: null, max: 500_000 }],
    },
    { explicit: { yes: [rows.gmt.id], no: [rows.sub.id, rows.explorer.id] } },
  );
});

test('size and era presets are inclusive and a missing value does not match', async () => {
  await assertParity({ sizes: ['small', 'xlarge'] }, {
    explicit: {
      yes: [rows.tudor.id, rows.tank.id, rows.unstyled.id, rows.patek.id, rows.sub.id],
      no: [rows.speedy.id, rows.explorer.id, rows.rail.id],
    },
  });
  // 34 is under-34 and 34–36. 36 is 34–36 and 36–39. 39 is 36–39 and 39+.
  await assertParity({ sizes: ['mid'] }, {
    explicit: { yes: [rows.tudor.id, rows.explorer.id, rows.edge5k.id], no: [rows.sub.id, rows.tank.id] },
  });
  await assertParity({ sizes: ['nope'] });
  await assertParity({ sizes: ['nope', 'small'] }, {
    explicit: { yes: [rows.tudor.id, rows.tank.id], no: [rows.sub.id] },
  });
  await assertParity({ eras: ['prewar', 'modern'] }, {
    explicit: { yes: [rows.tank.id, rows.patek.id], no: [rows.tudor.id, rows.rail.id] },
  });
  await assertParity({ eras: ['fifties', 'seventies'] }, {
    explicit: { yes: [rows.tudor.id, rows.explorer.id, rows.edge5k.id, rows.gmt.id], no: [rows.tank.id] },
  });
  await assertParity({ eras: ['not-a-decade'] });
});

test('text query matches v1 and the shop page for a term inside one field', async () => {
  await assertParity({ query: 'Submariner' }, {
    explicit: { yes: [rows.sub.id], no: [rows.speedy.id, rows.gmt.id] },
  });
  await assertParity({ query: 'speed' }, {
    explicit: { yes: [rows.speedy.id], no: [rows.moon.id, rows.sub.id] },
  });
  await assertParity({ query: 'Rolex Submariner' }, {
    explicit: { yes: [rows.sub.id], no: [rows.gmt.id] },
  });
  await assertParity({ query: '1675' }, {
    explicit: { yes: [rows.gmt.id], no: [rows.sub.id] },
  });
  await assertParity({ query: 'GMT-Master' }, {
    explicit: { yes: [rows.gmt.id], no: [rows.sub.id] },
  });
  const hidden = await pageV2({ query: `kq7-hidden-${stamp}` });
  assert.deepEqual(hidden, []);
  const sold = await pageV2({ query: `kq7-sold-${stamp}` });
  assert.deepEqual(sold, []);
  const pending = await pageV2({ query: `kq7-pending-${stamp}` });
  assert.deepEqual(pending, []);
  const paused = await pageV2({ query: `kq7-paused-${stamp}` });
  assert.deepEqual(paused, []);
});

test('an empty catalogue-wide spec agrees between v1 and v2', async () => {
  const c1 = await counts('v1', NO_FILTERS);
  const c2 = await counts('v2', {});
  const cNull = await counts('v2', null);
  assert.equal(c1.matched, c2.matched);
  assert.equal(c1.total, c2.total);
  assert.equal(cNull.matched, c2.matched);
  assert.equal(cNull.total, c2.total);
  const walked = await pageV2({});
  assert.equal(walked.length, c2.matched);
  assert.equal(walked.length, c2.total);
  if (c1.matched <= 50) {
    const v1 = await searchV1(NO_FILTERS, { limit: 50 });
    assert.deepEqual(
      sorted(v1.map((row) => row.id)),
      sorted(walked.map((row) => row.listing.id)),
    );
  }
  for (const id of [rows.hidden.id, rows.sold.id, rows.pending.id, rows.paused.id]) {
    assert.equal(
      walked.some((row) => row.listing.id === id),
      false,
      id,
    );
  }
});

test('a swipe and a claimed shop drop out of both versions together', async () => {
  const swiped = await api('/rest/v1/swipes', {
    token: service,
    method: 'POST',
    prefer: 'return=representation',
    body: { actor_id: buyer.id, listing_id: rows.tudor.id, direction: 'left' },
  });
  assert.equal(swiped.status, 201, JSON.stringify(swiped.body));

  const filters = filtersOf({});
  const canonical = spec();
  const options = { token: buyer.token, excludeSwiped: true };
  const v1 = await searchV1(filters, options);
  const v2 = await pageV2(canonical, { ...options, limit: 5 });
  const c1 = await counts('v1', filters, options);
  const c2 = await counts('v2', canonical, options);
  const expected = universe.filter((row) => row.id !== rows.tudor.id).map((row) => row.id);
  assert.deepEqual(sorted(v1.map((row) => row.id)), sorted(expected));
  assert.deepEqual(sorted(v2.map((row) => row.listing.id)), sorted(expected));
  assert.equal(c1.matched, expected.length);
  assert.equal(c2.matched, expected.length);

  const kept = await pageV2(canonical, { token: buyer.token, excludeSwiped: false, limit: 5 });
  assert.equal(kept.some((row) => row.listing.id === rows.tudor.id), true);

  const own = { token: buyer.token, excludeOwn: true };
  const hiddenV1 = await searchV1(asFilters(canonicalize({ dealers: [dealers.claimed.id] }).spec), own);
  const hiddenV2 = await pageV2(canonicalize({ dealers: [dealers.claimed.id] }).spec, own);
  assert.deepEqual(hiddenV1, []);
  assert.deepEqual(hiddenV2, []);
  const shown = await pageV2(canonicalize({ dealers: [dealers.claimed.id] }).spec, {
    token: buyer.token,
    excludeOwn: false,
  });
  assert.deepEqual(shown.map((row) => row.listing.id), [rows.claimed.id]);
  const guest = await pageV2(canonicalize({ dealers: [dealers.claimed.id] }).spec, { excludeOwn: true });
  assert.deepEqual(guest.map((row) => row.listing.id), [rows.claimed.id]);
});

test('keyset pages cover every row once and do not move when a watch is inserted', async () => {
  const id = (n) =>
    `${stamp.toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  const ids = {
    newer: id(1),
    a: id(2),
    b: id(3),
    before: id(0x13),
    c: id(0x12),
    after: id(0x11),
    d: id(5),
    middle: id(6),
    e: id(7),
    f: id(8),
    g: id(9),
    h: id(10),
  };
  const pageSpec = canonicalize({ dealers: [dealers.page.id] }).spec;
  // Seconds past 2021-01-01, so 90 is a real minute-and-a-half and not
  // second 90, which Postgres rejects.
  const at = (seconds, micros = 0) => {
    const when = new Date(Date.UTC(2021, 0, 1) + seconds * 1000);
    return `${when.toISOString().slice(0, 19)}.${String(micros).padStart(6, '0')}Z`;
  };
  const mk = (key, seconds, micros = 0) =>
    insertListing({
      id: ids[key],
      dealer_id: dealers.page.id,
      imported_by: buyer.id,
      brand: 'Paging',
      model: key,
      reference: `page-${key}-${stamp}`,
      price_cents: 100,
      created_at: at(seconds, micros),
    });

  await mk('a', 190);
  await mk('b', 180);
  await mk('c', 170);
  await mk('d', 160);
  await mk('e', 150);
  await mk('f', 140);
  await mk('g', 130);
  await mk('h', 120);

  const first = await searchV2(pageSpec, { limit: 3 });
  const again = await searchV2(pageSpec, { limit: 3 });
  assert.deepEqual(
    first.map((row) => row.listing.id),
    [ids.a, ids.b, ids.c],
  );
  assert.equal(first[0].cursor, again[0].cursor);
  assert.equal(typeof first[0].cursor, 'string');
  assert.equal(first[0].cursor.includes(ids.c), false);

  await mk('newer', 200);
  await mk('before', 170);
  await mk('after', 170);
  await mk('middle', 155);

  const rest = [];
  let cursor = first[0].cursor;
  for (;;) {
    const page = await searchV2(pageSpec, { limit: 3, cursor });
    rest.push(...page.map((row) => row.listing.id));
    if (page[0]?.cursor == null) break;
    cursor = page[0].cursor;
  }
  assert.deepEqual(rest, [ids.after, ids.d, ids.middle, ids.e, ids.f, ids.g, ids.h]);

  const all = await pageV2(pageSpec, { limit: 3 });
  assert.deepEqual(
    all.map((row) => row.listing.id),
    [ids.newer, ids.a, ids.b, ids.before, ids.c, ids.after, ids.d, ids.middle, ids.e, ids.f, ids.g, ids.h],
  );

  const bad = await api('/rest/v1/rpc/search_listings_v2', {
    method: 'POST',
    body: { p_spec: pageSpec, p_cursor: 'not-a-cursor' },
  });
  assert.equal(bad.ok, false);
  const mismatched = await api('/rest/v1/rpc/search_listings_v2', {
    method: 'POST',
    body: { p_spec: pageSpec, p_cursor: first[0].cursor, p_sort: 'price_asc' },
  });
  assert.equal(mismatched.ok, false);
  const otherFlag = await api('/rest/v1/rpc/search_listings_v2', {
    method: 'POST',
    body: { p_spec: pageSpec, p_cursor: first[0].cursor, p_favorites_first: true },
  });
  assert.equal(otherFlag.ok, false);

  const one = await searchV2(pageSpec, { limit: 0 });
  assert.equal(one.length, 1);

  // A microsecond is enough to order two watches that share a clock second.
  const early = id(20);
  const later = id(21);
  await insertListing({
    id: early,
    dealer_id: dealers.page.id,
    imported_by: buyer.id,
    brand: 'Paging',
    model: 'early',
    reference: `page-early-${stamp}`,
    created_at: '2022-01-01T00:00:00.000001Z',
  });
  await insertListing({
    id: later,
    dealer_id: dealers.page.id,
    imported_by: buyer.id,
    brand: 'Paging',
    model: 'later',
    reference: `page-later-${stamp}`,
    created_at: '2022-01-01T00:00:00.000002Z',
  });
  const micros = await pageV2(
    canonicalize({ dealers: [dealers.page.id], query: 'early' }).spec,
    { limit: 1 },
  );
  // "early" is only on that one model. "later" must not come along.
  assert.equal(micros.length, 1);
  const pair = await pageV2(canonicalize({ dealers: [dealers.page.id], brands: ['paging'] }).spec, {
    limit: 1,
  });
  const pairIds = pair.map((row) => row.listing.id);
  assert.ok(pairIds.indexOf(later) < pairIds.indexOf(early));
});

test('null prices and years sort last, and favorites stay ahead of a newer watch', async () => {
  const at = '2023-01-01T00:00:00.000000Z';
  const id = (n) =>
    `${(stamp + 1).toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  const low = id(1);
  const tieHigh = id(3);
  const tieLow = id(2);
  const high = id(4);
  const missing = id(5);
  const mk = (rowId, price, year, brand) =>
    insertListing({
      id: rowId,
      dealer_id: dealers.sort.id,
      imported_by: buyer.id,
      brand,
      model: 'Sort',
      reference: rowId,
      price_cents: price,
      year,
      created_at: at,
    });
  await mk(low, 50, 1960, 'Sortbrand');
  await mk(tieHigh, 100, 1980, 'Sortbrand');
  await mk(tieLow, 100, null, 'Sortbrand');
  await mk(high, 500, 1970, 'Rolex');
  await mk(missing, null, 1990, 'Sortbrand');

  const sortSpec = canonicalize({ dealers: [dealers.sort.id] }).spec;
  const byPrice = await pageV2(sortSpec, { limit: 1, sort: 'price_asc' });
  assert.deepEqual(
    byPrice.map((row) => row.listing.id),
    [low, tieHigh, tieLow, high, missing],
  );
  const byPriceDesc = await pageV2(sortSpec, { limit: 2, sort: 'price_desc' });
  assert.deepEqual(
    byPriceDesc.map((row) => row.listing.id),
    [high, tieHigh, tieLow, low, missing],
  );
  const oldest = await pageV2(sortSpec, { limit: 2, sort: 'oldest' });
  assert.equal(oldest.at(-1).listing.id, tieLow);
  assert.deepEqual(oldest.slice(0, 4).map((row) => row.listing.year), [1960, 1970, 1980, 1990]);
  const newestWatch = await pageV2(sortSpec, { limit: 5, sort: 'newest_watch' });
  assert.equal(newestWatch.at(-1).listing.id, tieLow);
  assert.deepEqual(
    newestWatch.slice(0, 4).map((row) => row.listing.year),
    [1990, 1980, 1970, 1960],
  );

  const filters = asFilters(sortSpec);
  for (const sort of ['price_asc', 'price_desc', 'oldest', 'newest_watch', 'newest']) {
    const v1 = await searchV1(filters, { sort });
    const v2 = await pageV2(sortSpec, { sort, limit: 2 });
    assert.deepEqual(
      sorted(v1.map((row) => row.id)),
      sorted(v2.map((row) => row.listing.id)),
    );
  }

  await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: service,
    method: 'PATCH',
    body: { favorite_brands: ['rolex'] },
  });
  const fav = await pageV2(sortSpec, {
    token: buyer.token,
    favoritesFirst: true,
    limit: 2,
  });
  assert.equal(fav[0].listing.id, high);
  assert.deepEqual(
    fav.slice(1).map((row) => row.listing.brand_key),
    ['sortbrand', 'sortbrand', 'sortbrand', 'sortbrand'],
  );
  const v1fav = await searchV1(filters, { token: buyer.token, favoritesFirst: true });
  assert.deepEqual(
    sorted(v1fav.map((row) => row.id)),
    sorted(fav.map((row) => row.listing.id)),
  );
});
