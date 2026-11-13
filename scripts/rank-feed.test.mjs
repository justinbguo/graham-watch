import assert from 'node:assert/strict';
import test from 'node:test';

import { brandKey, emptyTaste, orderFeed } from '../src/data/rank.ts';
import { config, request, serviceKey } from './_supabase.mjs';

const DAY = 86_400_000;
const stamp = Date.now();
const seed = { brands: ['Rolex'], styles: ['diver'], priceBand: 'high' };

let url;
let anon;
let service;
let buyer;
let stranger;
const dealers = {};
const listings = {};

function ago(days) {
  return new Date(Date.now() - days * DAY).toISOString();
}

async function api(path, { token, method = 'GET', body, prefer } = {}) {
  const res = await request(path, { token: token ?? service, method, body, prefer });
  return res;
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
    token: anon,
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
    method: 'POST',
    prefer: 'return=representation',
    body: fields,
  });
  if (res.status !== 201) throw new Error(`dealer insert: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body[0];
}

async function insertListing(fields, photoCount) {
  const res = await api('/rest/v1/listings?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: fields,
  });
  if (res.status !== 201) throw new Error(`listing insert: ${res.status} ${JSON.stringify(res.body)}`);
  const listing = res.body[0];
  if (photoCount > 0) {
    const photos = await api('/rest/v1/listing_photos', {
      method: 'POST',
      prefer: 'return=minimal',
      body: Array.from({ length: photoCount }, (_, position) => ({
        listing_id: listing.id,
        position,
        source_url: `https://example.test/rank-${stamp}-${position}.jpg`,
      })),
    });
    if (photos.status !== 201) {
      throw new Error(`photo insert: ${photos.status} ${JSON.stringify(photos.body)}`);
    }
  }
  return listing;
}

function watchOf(row, photoCount) {
  return {
    id: row.id,
    brandKey: row.brand_key ?? brandKey(row.brand),
    style: row.style,
    priceCents: row.price_cents,
    createdAtMs: Date.parse(row.created_at),
    dealerId: row.dealer_id,
    photoCount,
  };
}

async function walk(token, spec) {
  const ids = [];
  let cursor = null;
  for (let page = 0; page < 12; page += 1) {
    const res = await api('/rest/v1/rpc/rank_buy_feed', {
      token,
      method: 'POST',
      body: {
        p_spec: spec,
        p_limit: 3,
        p_cursor: cursor,
        p_seed: seed,
      },
    });
    if (!res.ok) throw new Error(`rank_buy_feed ${res.status} ${JSON.stringify(res.body)}`);
    const rows = res.body ?? [];
    ids.push(...rows.map((row) => row.listing.id));
    const next = rows[0]?.cursor ?? null;
    if (rows.length === 0 || next == null) return ids;
    assert.notEqual(next, cursor, 'the next page must move the cursor');
    cursor = next;
  }
  throw new Error('the fixture did not finish paging');
}

test.before(async () => {
  const cfg = config();
  if (!cfg.isLocal) throw new Error(`Refusing to write fixtures to ${cfg.url}`);
  url = cfg.url;
  anon = cfg.anonKey;
  service = serviceKey();
  buyer = await createUser(`rank-feed-${stamp}@graham.test`);
  stranger = await createUser(`rank-stranger-${stamp}@graham.test`);

  const taste = await api(`/rest/v1/profiles?id=eq.${buyer.id}`, {
    token: buyer.token,
    method: 'PATCH',
    prefer: 'return=minimal',
    body: { favorite_brands: ['Omega'] },
  });
  if (!taste.ok) throw new Error(`favorite brands: ${taste.status} ${JSON.stringify(taste.body)}`);

  dealers.open = await insertDealer({
    name: `Rank Open ${stamp}`,
    website: `https://rank-open-${stamp}.test`,
    permission: 'approved',
  });
  dealers.other = await insertDealer({
    name: `Rank Other ${stamp}`,
    website: `https://rank-other-${stamp}.test`,
    permission: 'approved',
  });
  dealers.claimed = await insertDealer({
    name: `Rank Claimed ${stamp}`,
    website: `https://rank-claimed-${stamp}.test`,
    permission: 'approved',
    claimed_by: buyer.id,
  });
  dealers.pending = await insertDealer({
    name: `Rank Pending ${stamp}`,
    website: `https://rank-pending-${stamp}.test`,
    permission: 'pending',
  });

  const follow = await api('/rest/v1/dealer_follows', {
    token: buyer.token,
    method: 'POST',
    prefer: 'return=minimal',
    body: { user_id: buyer.id, dealer_id: dealers.open.id },
  });
  if (!follow.ok) throw new Error(`follow: ${follow.status} ${JSON.stringify(follow.body)}`);

  listings.rolexNew = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Rolex',
    model: 'Sub',
    style: 'diver',
    price_cents: 2_000_000,
    created_at: ago(2),
  }, 3);
  listings.rolexOld = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Rolex',
    model: 'Datejust',
    style: 'dress',
    price_cents: 400_000,
    created_at: ago(45),
  }, 5);
  listings.omega = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Omega',
    model: 'Seamaster',
    style: 'diver',
    price_cents: 800_000,
    created_at: ago(14),
  }, 3);
  listings.cartier = await insertListing({
    dealer_id: dealers.other.id,
    brand: 'Cartier',
    model: 'Tank',
    style: 'other',
    price_cents: null,
    created_at: ago(120),
  }, 3);
  listings.patek = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Patek Philippe',
    model: 'Calatrava',
    style: 'dress',
    price_cents: 2_000_000,
    created_at: ago(2),
  }, 3);
  listings.thin = await insertListing({
    dealer_id: dealers.open.id,
    imported_by: buyer.id,
    brand: 'Rolex',
    model: 'Thin',
    style: 'dress',
    price_cents: 900_000,
    created_at: ago(2),
  }, 1);
  listings.sold = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Omega',
    model: 'Sold',
    style: 'dress',
    price_cents: 800_000,
    created_at: ago(2),
    sold_at: new Date().toISOString(),
  }, 3);
  listings.ownShop = await insertListing({
    dealer_id: dealers.claimed.id,
    brand: 'Tudor',
    model: 'Black Bay',
    style: 'diver',
    price_cents: 2_000_000,
    created_at: ago(2),
  }, 3);
  listings.pending = await insertListing({
    dealer_id: dealers.pending.id,
    brand: 'Rolex',
    model: 'Hidden',
    style: 'diver',
    price_cents: 2_000_000,
    created_at: ago(2),
  }, 3);

  const swipe = await api('/rest/v1/swipes', {
    token: buyer.token,
    method: 'POST',
    prefer: 'return=minimal',
    body: { actor_id: buyer.id, listing_id: listings.patek.id, direction: 'left' },
  });
  if (!swipe.ok) throw new Error(`swipe: ${swipe.status} ${JSON.stringify(swipe.body)}`);
});

test.after(async () => {
  const ids = Object.values(dealers).map((dealer) => dealer.id);
  if (ids.length === 0) return;
  await api(`/rest/v1/dealers?id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
});

function spec() {
  return {
    dealers: [dealers.open.id, dealers.other.id, dealers.claimed.id, dealers.pending.id],
  };
}

function expectOrder(rows, { followedDealerIds, favoriteBrandKeys }) {
  const now = Date.now();
  return orderFeed(
    rows.map((row) => watchOf(row.listing, row.photos)),
    {
      events: [],
      watched: new Map(),
      followedDealerIds,
      seed,
      favoriteBrandKeys,
    },
    now,
  ).map((watch) => watch.id);
}

test('a guest page walk matches the ranker, and hidden watches stay hidden', async () => {
  const ids = await walk(anon, spec());
  const visible = [listings.rolexNew, listings.rolexOld, listings.omega, listings.cartier, listings.patek, listings.ownShop];
  assert.deepEqual(
    ids,
    expectOrder(visible.map((listing) => ({ listing, photos: listing.model === 'Datejust' ? 5 : 3 })), {
      followedDealerIds: new Set(),
      favoriteBrandKeys: [],
    }),
  );
  for (const hidden of [listings.thin, listings.sold, listings.pending]) {
    assert.equal(ids.includes(hidden.id), false);
  }
});

test('a buyer with taste, a follow, and a pass pages the same order, including a thin import', async () => {
  const ids = await walk(buyer.token, spec());
  const visible = [
    { listing: listings.rolexNew, photos: 3 },
    { listing: listings.rolexOld, photos: 5 },
    { listing: listings.omega, photos: 3 },
    { listing: listings.cartier, photos: 3 },
    { listing: listings.thin, photos: 1 },
  ];
  assert.deepEqual(
    ids,
    expectOrder(visible, {
      followedDealerIds: new Set([dealers.open.id]),
      favoriteBrandKeys: ['Omega'],
    }),
  );
  for (const hidden of [listings.patek, listings.sold, listings.pending, listings.ownShop]) {
    assert.equal(ids.includes(hidden.id), false);
  }
});

test('a signed-in buyer with no taste sees the guest catalogue', async () => {
  const guest = await walk(anon, spec());
  const plain = await walk(stranger.token, spec());
  assert.deepEqual(plain, guest);
});

test('New seats shops in turn, newest first inside a turn, without sealing a batch', async () => {
  const HOUR = 3_600_000;
  const shops = { a: crypto.randomUUID(), b: crypto.randomUUID(), c: crypto.randomUUID() };
  const fixture = [
    ['a-rolex-new', 'a', 'rolex', 1],
    ['a-rolex-old', 'a', 'rolex', 1.5],
    ['a-omega', 'a', 'omega', 3],
    ['a-none', 'a', null, 4],
    ['a-blank-1', 'a', '', 4.5],
    ['a-blank-2', 'a', '', 5],
    ['b-seiko', 'b', 'seiko', 2],
    ['c-tudor', 'c', 'tudor', 6],
  ].map(([label, shop, brand, hours]) => ({
    label,
    id: crypto.randomUUID(),
    dealer_id: shops[shop],
    brand_key: brand,
    score: 0,
    created_at: new Date(stamp - hours * HOUR).toISOString(),
  }));
  const labelOf = new Map(fixture.map((item) => [item.id, item.label]));
  const createdOf = new Map(fixture.map((item) => [item.id, Date.parse(item.created_at)]));

  const res = await api('/rest/v1/rpc/shop_mix', {
    method: 'POST',
    body: { p_items: fixture.map(({ label, ...item }) => item) },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const seated = [...res.body]
    .sort((a, b) => a.slot - b.slot || createdOf.get(b.id) - createdOf.get(a.id) || (a.id < b.id ? -1 : 1))
    .map((row) => labelOf.get(row.id));

  assert.deepEqual(seated, [
    'a-rolex-new',
    'b-seiko',
    'c-tudor',
    'a-omega',
    'a-none',
    'a-blank-1',
    'a-blank-2',
    'a-rolex-old',
  ]);

  const twin = orderFeed(
    fixture.map((item) => ({
      id: item.id,
      brandKey: item.brand_key,
      style: null,
      priceCents: null,
      createdAtMs: createdOf.get(item.id),
      dealerId: item.dealer_id,
      photoCount: 0,
    })),
    emptyTaste(),
    Date.now(),
  );
  assert.deepEqual(seated, twin.map((watch) => labelOf.get(watch.id)));

  for (const token of [anon, stranger.token]) {
    const denied = await api('/rest/v1/rpc/shop_mix', { token, method: 'POST', body: { p_items: [] } });
    assert.ok(denied.status >= 400, `shop_mix must not be callable by a client, got ${denied.status}`);
  }
});
