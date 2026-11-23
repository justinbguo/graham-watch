import assert from 'node:assert/strict';
import test from 'node:test';

import { brandKey, emptyTaste, orderFeed } from '../src/data/rank.ts';
import { config, request, serviceKey } from './_supabase.mjs';

const DAY = 86_400_000;
const stamp = Date.now();
const seed = { brands: ['Zenith'], styles: ['diver'], priceBand: 'high' };

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

  listings.zenithNew = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Zenith',
    model: 'Sub',
    style: 'diver',
    price_cents: 2_000_000,
    year: 1968,
    created_at: ago(2),
  }, 3);
  listings.zenithOld = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Zenith',
    model: 'Datejust',
    style: 'dress',
    price_cents: 400_000,
    year: 1960,
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
    year: null,
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
    brand: 'Zenith',
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
  listings.rolex = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Rolex',
    model: 'Submariner',
    year: 1968,
    created_at: ago(3),
  }, 3);
  listings.rolexSa = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Rolex SA',
    model: 'Datejust',
    year: 1972,
    created_at: ago(4),
  }, 3);
  listings.tudor = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Tudor',
    model: 'Oyster',
    year: 1968,
    created_at: ago(5),
  }, 3);
  listings.late = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Omega',
    model: 'Late',
    year: 1990,
    created_at: ago(6),
  }, 3);
  listings.boundary = await insertListing({
    dealer_id: dealers.open.id,
    brand: 'Omega',
    model: 'Boundary',
    year: 1985,
    created_at: ago(7),
  }, 3);
  listings.ownerRolex = await insertListing({
    dealer_id: dealers.claimed.id,
    brand: 'ROLEX',
    model: 'Owned',
    year: 1975,
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
  const visible = [
    listings.zenithNew,
    listings.zenithOld,
    listings.omega,
    listings.cartier,
    listings.patek,
    listings.ownShop,
    listings.tudor,
    listings.boundary,
  ];
  assert.deepEqual(
    ids,
    expectOrder(visible.map((listing) => ({ listing, photos: listing.model === 'Datejust' ? 5 : 3 })), {
      followedDealerIds: new Set(),
      favoriteBrandKeys: [],
    }),
  );
  for (const hidden of [listings.thin, listings.sold, listings.pending, listings.rolex, listings.rolexSa, listings.late, listings.ownerRolex]) {
    assert.equal(ids.includes(hidden.id), false, hidden.model);
  }
});

test('a buyer with taste, a follow, and a pass pages the same order, including a thin import', async () => {
  const ids = await walk(buyer.token, spec());
  const visible = [
    { listing: listings.zenithNew, photos: 3 },
    { listing: listings.zenithOld, photos: 5 },
    { listing: listings.omega, photos: 3 },
    { listing: listings.cartier, photos: 3 },
    { listing: listings.thin, photos: 1 },
    { listing: listings.tudor, photos: 3 },
    { listing: listings.boundary, photos: 3 },
  ];
  assert.deepEqual(
    ids,
    expectOrder(visible, {
      followedDealerIds: new Set([dealers.open.id]),
      favoriteBrandKeys: ['Omega'],
    }),
  );
  for (const hidden of [listings.patek, listings.sold, listings.pending, listings.ownShop, listings.rolex, listings.rolexSa, listings.late, listings.ownerRolex]) {
    assert.equal(ids.includes(hidden.id), false, hidden.model);
  }
});

test('a buyer cannot read a Rolex or a watch made after 1985, and the shop owner still can', async () => {
  assert.equal(listings.cartier.year, null);
  assert.equal(listings.rolex.year, 1968);
  assert.equal(listings.tudor.year, 1968);
  assert.equal(listings.late.year, 1990);
  assert.equal(listings.boundary.year, 1985);
  for (const token of [anon, stranger.token]) {
    const ids = await walk(token, spec());
    assert.equal(ids.includes(listings.rolex.id), false);
    assert.equal(ids.includes(listings.rolexSa.id), false);
    assert.equal(ids.includes(listings.late.id), false);
    assert.equal(ids.includes(listings.tudor.id), true);
    assert.equal(ids.includes(listings.boundary.id), true);
    assert.equal(ids.includes(listings.cartier.id), true);
    const hidden = await api(`/rest/v1/listings?id=eq.${listings.rolex.id}&select=id`, { token });
    assert.equal(hidden.status, 200);
    assert.deepEqual(hidden.body, []);
    const late = await api(`/rest/v1/listings?id=eq.${listings.late.id}&select=id`, { token });
    assert.deepEqual(late.body, []);
    const ownedHidden = await api(`/rest/v1/listings?id=eq.${listings.ownerRolex.id}&select=id`, { token });
    assert.equal(ownedHidden.status, 200);
    assert.deepEqual(ownedHidden.body, []);
    const search = await api('/rest/v1/rpc/search_listings_v2', {
      token,
      method: 'POST',
      body: { p_spec: spec(), p_limit: 50 },
    });
    assert.equal(search.status, 200, JSON.stringify(search.body));
    const found = new Set((search.body ?? []).map((row) => row.listing.id));
    assert.equal(found.has(listings.rolex.id), false);
    assert.equal(found.has(listings.rolexSa.id), false);
    assert.equal(found.has(listings.late.id), false);
    assert.equal(found.has(listings.tudor.id), true);
    assert.equal(found.has(listings.boundary.id), true);
    assert.equal(found.has(listings.cartier.id), true);
  }

  const owned = await api(`/rest/v1/listings?id=eq.${listings.ownerRolex.id}&select=id,brand`, {
    token: buyer.token,
  });
  assert.equal(owned.status, 200, JSON.stringify(owned.body));
  assert.equal(owned.body[0]?.id, listings.ownerRolex.id);
  assert.equal(owned.body[0]?.brand, 'ROLEX');
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

test('a shop that is not approved disappears for buyers and comes back when published', async () => {
  const buyer = await createUser(`pause-buyer-${stamp}@graham.test`);
  const owner = await createUser(`pause-owner-${stamp}@graham.test`);
  const operator = await createUser(`pause-operator-${stamp}@graham.test`);
  const op = await api('/rest/v1/operators', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { user_id: operator.id },
  });
  assert.equal(op.status, 201, JSON.stringify(op.body));

  const shop = await insertDealer({
    name: `Pause Shop ${stamp}`,
    website: `https://pause-${stamp}.test`,
    permission: 'approved',
  });
  const ownedShop = await insertDealer({
    name: `Pause Owned ${stamp}`,
    website: `https://pause-owned-${stamp}.test`,
    permission: 'approved',
    claimed_by: owner.id,
  });

  try {
    const follow = await api('/rest/v1/dealer_follows', {
      token: buyer.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: { user_id: buyer.id, dealer_id: shop.id },
    });
    assert.equal(follow.status, 201, JSON.stringify(follow.body));

    const listedAt = new Date(Date.now() + 1000).toISOString();
    const shown = await insertListing({
      dealer_id: shop.id,
      brand: 'Tudor',
      model: 'Shown',
      year: 1968,
      price_cents: 400_000,
      created_at: listedAt,
    }, 3);
    const saved = await insertListing({
      dealer_id: shop.id,
      brand: 'Omega',
      model: 'Saved',
      year: 1970,
      price_cents: 500_000,
      created_at: listedAt,
    }, 3);
    const owned = await insertListing({
      dealer_id: ownedShop.id,
      brand: 'Tudor',
      model: 'Owned',
      year: 1965,
      price_cents: 300_000,
    }, 3);

    const seal = await api('/rest/v1/rpc/seal_catalogue_batch', {
      method: 'POST',
      body: { p_batch_id: crypto.randomUUID() },
    });
    assert.equal(seal.status, 200, JSON.stringify(seal.body));

    const swipe = await api('/rest/v1/swipes', {
      token: buyer.token,
      method: 'POST',
      prefer: 'return=minimal',
      body: { actor_id: buyer.id, listing_id: saved.id, direction: 'right' },
    });
    assert.equal(swipe.status, 201, JSON.stringify(swipe.body));

    async function setPermission(dealerId, permission) {
      const res = await api(`/rest/v1/dealers?id=eq.${dealerId}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { permission },
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.[0]?.permission, permission);
    }

    async function readPaths(token) {
      const detail = await api(`/rest/v1/listings?id=eq.${shown.id}&select=id`, { token });
      const shopPage = await api(
        `/rest/v1/listings?dealer_id=eq.${shop.id}&status=eq.active&sold_at=is.null&select=id`,
        { token },
      );
      const photos = await api(`/rest/v1/listing_photos?listing_id=eq.${shown.id}&select=listing_id`, { token });
      const wishlist = await api(`/rest/v1/listings?id=eq.${saved.id}&select=id`, { token });
      const search = await api('/rest/v1/rpc/search_listings', {
        token,
        method: 'POST',
        body: { p_limit: 50, p_exclude_own: false, p_dealers: [shop.id] },
      });
      const searchV2 = await api('/rest/v1/rpc/search_listings_v2', {
        token,
        method: 'POST',
        body: { p_spec: { dealers: [shop.id] }, p_limit: 50, p_exclude_own: false },
      });
      const rank = await api('/rest/v1/rpc/rank_buy_feed', {
        token,
        method: 'POST',
        body: { p_spec: { dealers: [shop.id] }, p_limit: 20 },
      });
      const counts = await api('/rest/v1/rpc/listing_counts', {
        token,
        method: 'POST',
        body: { p_exclude_own: false, p_dealers: [shop.id] },
      });
      const fresh = await api('/rest/v1/rpc/latest_catalogue_batch', { token, method: 'POST' });
      const drops = await api('/rest/v1/rpc/followed_new_listing_ids', { token, method: 'POST' });
      const rule = await api('/rest/v1/rpc/listing_for_buyer', {
        token,
        method: 'POST',
        body: { p_listing: shown },
      });
      for (const res of [detail, shopPage, photos, wishlist, search, searchV2, rank, counts, fresh, rule]) {
        assert.equal(res.status, 200, JSON.stringify(res.body));
      }
      const ids = (body) => (body ?? []).map((row) => row.id ?? row.listing?.id);
      return {
        detail: ids(detail.body).includes(shown.id),
        shop: ids(shopPage.body).includes(shown.id) && ids(shopPage.body).includes(saved.id),
        photos: (photos.body ?? []).length > 0,
        wishlist: ids(wishlist.body).includes(saved.id),
        search: ids(search.body).includes(shown.id) && ids(search.body).includes(saved.id),
        searchV2: ids(searchV2.body).includes(shown.id) && ids(searchV2.body).includes(saved.id),
        rankShown: ids(rank.body).includes(shown.id),
        rankSaved: ids(rank.body).includes(saved.id),
        count: Number(counts.body?.[0]?.matched ?? -1),
        freshShown: (fresh.body?.[0]?.listing_ids ?? []).includes(shown.id),
        freshSaved: (fresh.body?.[0]?.listing_ids ?? []).includes(saved.id),
        drops: drops.status === 200 && (drops.body ?? []).some((row) => row.id === shown.id),
        buyerRule: rule.body,
      };
    }

    const open = await readPaths(anon);
    assert.deepEqual(open, {
      detail: true,
      shop: true,
      photos: true,
      wishlist: true,
      search: true,
      searchV2: true,
      rankShown: true,
      rankSaved: true,
      count: 2,
      freshShown: true,
      freshSaved: true,
      drops: false,
      buyerRule: true,
    });
    const openBuyer = await readPaths(buyer.token);
    assert.equal(openBuyer.drops, true);
    assert.equal(openBuyer.detail, true);
    assert.equal(openBuyer.wishlist, true);
    assert.equal(openBuyer.rankShown, true);
    assert.equal(openBuyer.rankSaved, false);
    assert.equal(openBuyer.buyerRule, true);

    await setPermission(shop.id, 'paused');
    await setPermission(ownedShop.id, 'paused');

    for (const token of [anon, buyer.token]) {
      const hidden = await readPaths(token);
      assert.equal(hidden.buyerRule, false, 'listing_for_buyer');
      assert.deepEqual(
        {
          detail: hidden.detail,
          shop: hidden.shop,
          photos: hidden.photos,
          wishlist: hidden.wishlist,
          search: hidden.search,
          searchV2: hidden.searchV2,
          rankShown: hidden.rankShown,
          rankSaved: hidden.rankSaved,
          count: hidden.count,
          freshShown: hidden.freshShown,
          freshSaved: hidden.freshSaved,
          drops: hidden.drops,
        },
        {
          detail: false,
          shop: false,
          photos: false,
          wishlist: false,
          search: false,
          searchV2: false,
          rankShown: false,
          rankSaved: false,
          count: 0,
          freshShown: false,
          freshSaved: false,
          drops: false,
        },
      );
    }

    const consoleRows = await api('/rest/v1/rpc/operator_listings', {
      token: operator.token,
      method: 'POST',
      body: { p_dealer_id: shop.id },
    });
    assert.equal(consoleRows.status, 200, JSON.stringify(consoleRows.body));
    assert.equal((consoleRows.body ?? []).some((row) => row.id === shown.id), true);
    assert.equal((consoleRows.body ?? []).some((row) => row.id === saved.id), true);

    const ownerRead = await api(`/rest/v1/listings?id=eq.${owned.id}&select=id`, { token: owner.token });
    assert.equal(ownerRead.status, 200, JSON.stringify(ownerRead.body));
    assert.equal(ownerRead.body?.[0]?.id, owned.id);
    const strangerOwned = await api(`/rest/v1/listings?id=eq.${owned.id}&select=id`, { token: buyer.token });
    assert.deepEqual(strangerOwned.body, []);

    await setPermission(shop.id, 'approved');
    const resumed = await readPaths(anon);
    assert.equal(resumed.buyerRule, true);
    assert.equal(resumed.detail, true);
    assert.equal(resumed.shop, true);
    assert.equal(resumed.photos, true);
    assert.equal(resumed.wishlist, true);
    assert.equal(resumed.search, true);
    assert.equal(resumed.searchV2, true);
    assert.equal(resumed.rankShown, true);
    assert.equal(resumed.rankSaved, true);
    assert.equal(resumed.count, 2);
    assert.equal(resumed.freshShown, true);
    assert.equal(resumed.freshSaved, true);
    const resumedBuyer = await readPaths(buyer.token);
    assert.equal(resumedBuyer.drops, true);
    assert.equal(resumedBuyer.wishlist, true);

    await setPermission(shop.id, 'pending');
    const pending = await readPaths(anon);
    assert.equal(pending.buyerRule, false);
    assert.equal(pending.detail, false);
    assert.equal(pending.search, false);
    assert.equal(pending.freshShown, false);
    assert.equal(pending.count, 0);
  } finally {
    await api(`/rest/v1/dealers?id=in.(${shop.id},${ownedShop.id})`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  }
});

async function feedPage(token, cursor, spec = {}) {
  return api('/rest/v1/rpc/rank_buy_feed', {
    token,
    method: 'POST',
    body: { p_spec: spec, p_limit: 2, p_cursor: cursor, p_seed: {} },
  });
}

test('a two-word query matches the same watches on Buy, Search, and New', async () => {
  const shop = await insertDealer({
    name: `Filter Shop ${stamp}`,
    website: `https://filter-shop-${stamp}.test`,
    permission: 'approved',
  });
  const person = await createUser(`filter-query-${stamp}@graham.test`);
  try {
    const hit = await insertListing({
      dealer_id: shop.id,
      brand: 'Tudor',
      model: 'Zzproof Qq5513',
      year: 1968,
      price_cents: 400_000,
      created_at: ago(10),
    }, 3);
    const miss = await insertListing({
      dealer_id: shop.id,
      brand: 'Tudor',
      model: 'Plain',
      reference: '1000',
      year: 1968,
      price_cents: 400_000,
      created_at: ago(11),
    }, 3);
    const spec = { query: 'zzproof qq5513' };
    const buy = await api('/rest/v1/rpc/rank_buy_feed', {
      token: person.token,
      method: 'POST',
      body: { p_spec: spec, p_limit: 20, p_cursor: null, p_seed: {} },
    });
    const search = await api('/rest/v1/rpc/search_listings_v2', {
      token: person.token,
      method: 'POST',
      body: {
        p_spec: spec,
        p_limit: 20,
        p_cursor: null,
        p_exclude_own: false,
        p_exclude_swiped: false,
      },
    });
    const fresh = await api('/rest/v1/rpc/filter_listing_ids', {
      token: person.token,
      method: 'POST',
      body: { p_ids: [hit.id, miss.id], p_spec: spec },
    });
    if (!buy.ok) throw new Error(`buy ${buy.status} ${JSON.stringify(buy.body)}`);
    if (!search.ok) throw new Error(`search ${search.status} ${JSON.stringify(search.body)}`);
    if (!fresh.ok) throw new Error(`new ${fresh.status} ${JSON.stringify(fresh.body)}`);
    const buyIds = (buy.body ?? []).map((row) => row.listing.id).sort();
    const searchIds = (search.body ?? []).map((row) => row.listing.id).sort();
    const newIds = (fresh.body ?? []).map((row) => row.id).sort();
    assert.deepEqual(buyIds, [hit.id]);
    assert.deepEqual(searchIds, [hit.id]);
    assert.deepEqual(newIds, [hit.id]);
  } finally {
    await api(`/rest/v1/dealers?id=eq.${shop.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await fetch(`${url}/auth/v1/admin/users/${person.id}`, {
      method: 'DELETE',
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    });
  }
});

test('a save changes page 2', async () => {
  const shop = await insertDealer({
    name: `Taste Shop ${stamp}`,
    website: `https://taste-shop-${stamp}.test`,
    permission: 'approved',
  });
  const person = await createUser(`taste-page-${stamp}@graham.test`);
  const brands = ['Accutron', 'Bulova', 'Certina', 'Doxa'];
  try {
    const rows = [];
    for (let index = 0; index < brands.length; index += 1) {
      rows.push(await insertListing({
        dealer_id: shop.id,
        brand: brands[index],
        model: `Page ${index}`,
        year: 1968,
        price_cents: 400_000,
        style: 'dress',
        created_at: ago(20 - index),
      }, 3));
    }
    const first = await feedPage(person.token, null);
    if (!first.ok) throw new Error(`page 1 ${first.status} ${JSON.stringify(first.body)}`);
    const cursor = first.body?.[0]?.cursor ?? null;
    assert.equal(typeof cursor, 'string');
    const second = await feedPage(person.token, cursor);
    if (!second.ok) throw new Error(`page 2 ${second.status} ${JSON.stringify(second.body)}`);
    const before = (second.body ?? []).map((row) => row.listing.id);
    assert.equal(before.length, 2);
    const saved = rows[0];
    const event = await api('/rest/v1/rpc/log_buyer_events', {
      token: person.token,
      method: 'POST',
      body: {
        p_events: [{
          id: crypto.randomUUID(),
          kind: 'save',
          surface: 'buy',
          occurred_at: new Date().toISOString(),
          listing_id: saved.id,
          dealer_id: shop.id,
        }],
      },
    });
    if (!event.ok) throw new Error(`save ${event.status} ${JSON.stringify(event.body)}`);
    const stale = await feedPage(person.token, cursor);
    assert.equal(stale.ok, false);
    assert.match(JSON.stringify(stale.body), /does not match this search/);
    const again = await feedPage(person.token, null);
    if (!again.ok) throw new Error(`fresh page 1 ${again.status} ${JSON.stringify(again.body)}`);
    const nextCursor = again.body?.[0]?.cursor ?? null;
    const moved = await feedPage(person.token, nextCursor);
    if (!moved.ok) throw new Error(`fresh page 2 ${moved.status} ${JSON.stringify(moved.body)}`);
    const after = (moved.body ?? []).map((row) => row.listing.id);
    assert.notDeepEqual(after, before);
    assert.equal((again.body ?? []).some((row) => row.listing.id === saved.id), true);
  } finally {
    await api(`/rest/v1/dealers?id=eq.${shop.id}`, { method: 'DELETE', prefer: 'return=minimal' });
    await fetch(`${url}/auth/v1/admin/users/${person.id}`, {
      method: 'DELETE',
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    });
  }
});
