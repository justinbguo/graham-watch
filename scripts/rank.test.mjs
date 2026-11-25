import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RANK,
  brandKey,
  emptyTaste,
  orderFeed,
  scoreWatch,
  tasteWeights,
} from '../src/data/rank.ts';
import { shopCounts } from './shop-mix-report.mjs';

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const DAY = 86_400_000;

function watch(overrides) {
  return {
    id: 'w',
    brandKey: 'rolex',
    style: 'dress',
    priceCents: 800_000,
    createdAtMs: NOW - 40 * DAY,
    dealerId: 'shop-a',
    photoCount: 3,
    ...overrides,
  };
}

function taste(overrides = {}) {
  return {
    ...emptyTaste(),
    ...overrides,
  };
}

test('a dealer click outranks a save when everything else matches', () => {
  const omega = watch({ id: 'omega', brandKey: 'omega', dealerId: 'shop-o' });
  const rolex = watch({ id: 'rolex', brandKey: 'rolex', dealerId: 'shop-r' });
  const ordered = orderFeed(
    [rolex, omega],
    taste({
      events: [
        { kind: 'save', listingId: 'rolex', at: 1 },
        { kind: 'dealer_click', listingId: 'omega', at: 2 },
      ],
      watched: new Map([
        ['rolex', rolex],
        ['omega', omega],
      ]),
    }),
    NOW,
  );
  assert.equal(ordered[0].id, 'omega');
  assert.equal(ordered[1].id, 'rolex');
});

test('an undone pass does not count, and a pass that stays does', () => {
  const kept = watch({ id: 'kept', brandKey: 'omega' });
  const undone = watch({ id: 'undone', brandKey: 'rolex' });
  const base = {
    watched: new Map([
      ['kept', kept],
      ['undone', undone],
    ]),
  };
  const withUndo = orderFeed(
    [undone, kept],
    taste({
      ...base,
      events: [
        { kind: 'pass', listingId: 'undone', at: 1 },
        { kind: 'undo', listingId: 'undone', at: 2 },
      ],
    }),
    NOW,
  );
  const weights = tasteWeights(
    taste({
      ...base,
      events: [
        { kind: 'pass', listingId: 'undone', at: 1 },
        { kind: 'undo', listingId: 'undone', at: 2 },
      ],
    }),
  );
  assert.equal(weights.brand.get('rolex') ?? 0, 0);
  assert.deepEqual(
    withUndo.map((item) => item.id),
    orderFeed([undone, kept], taste({ watched: base.watched }), NOW).map((item) => item.id),
  );

  const stillPassed = orderFeed(
    [undone, kept],
    taste({
      ...base,
      events: [{ kind: 'pass', listingId: 'undone', at: 1 }],
    }),
    NOW,
  );
  assert.equal(stillPassed[0].id, 'kept');
  assert.equal(tasteWeights(taste({
    ...base,
    events: [{ kind: 'pass', listingId: 'undone', at: 1 }],
  })).brand.get('rolex'), RANK.pass);
});

test('a followed shop scores the follow weight above the same watch unfollowed', () => {
  const bench = watch({ id: 'bench', dealerId: 'bench' });
  const alone = scoreWatch(bench, tasteWeights(taste()), new Set(), NOW);
  const followed = scoreWatch(bench, tasteWeights(taste()), new Set(['bench']), NOW);
  assert.equal(followed - alone, RANK.follow);

  const other = watch({ id: 'other', brandKey: 'omega', dealerId: 'other' });
  const ordered = orderFeed(
    [other, bench],
    taste({ followedDealerIds: new Set(['bench']) }),
    NOW,
  );
  assert.equal(ordered[0].id, 'bench');
});

test('one shop still rotates brands, so a loved brand does not take its whole top', () => {
  const rolex = Array.from({ length: 6 }, (_, index) =>
    watch({ id: `rolex-${index}`, brandKey: 'rolex', createdAtMs: NOW - index * 1000 }),
  );
  const omega = Array.from({ length: 6 }, (_, index) =>
    watch({ id: `omega-${index}`, brandKey: 'omega', createdAtMs: NOW - index * 1000 }),
  );
  const ordered = orderFeed(
    [...rolex, ...omega],
    taste({
      events: [{ kind: 'dealer_click', listingId: 'rolex-0', at: 1 }],
      watched: new Map([['rolex-0', rolex[0]]]),
    }),
    NOW,
  );
  assert.equal(new Set(ordered.map((item) => item.dealerId)).size, 1);
  assert.deepEqual(
    ordered.slice(0, 4).map((item) => item.brandKey),
    ['rolex', 'omega', 'rolex', 'omega'],
  );
});

test('a shop with many brands does not take the second seat from a shop with one watch', () => {
  const big = ['rolex', 'omega', 'tudor', 'cartier', 'zenith', 'heuer'].map((brand) =>
    watch({ id: `big-${brand}`, brandKey: brand, dealerId: 'big', createdAtMs: NOW - DAY }),
  );
  const small = watch({ id: 'small-seiko', brandKey: 'seiko', dealerId: 'small', createdAtMs: NOW - 40 * DAY });
  const clicked = big[3];
  const shopTaste = taste({
    events: [{ kind: 'dealer_click', listingId: clicked.id, at: 1 }],
    watched: new Map([[clicked.id, clicked]]),
  });
  const weights = tasteWeights(shopTaste);
  for (const item of big) {
    assert.ok(scoreWatch(item, weights, new Set(), NOW) > scoreWatch(small, weights, new Set(), NOW));
  }

  const ordered = orderFeed([...big, small], shopTaste, NOW);
  assert.equal(ordered[0].id, clicked.id, 'the click still picks which big-shop watch leads');
  assert.equal(ordered[1].id, small.id, 'the small shop takes the second seat');
  assert.deepEqual(new Set(ordered.slice(2).map((item) => item.dealerId)), new Set(['big']));
});

function orderBeforeShopTurns(watches, roundTaste, nowMs) {
  const weights = tasteWeights(roundTaste);
  const score = (item) => scoreWatch(item, weights, roundTaste.followedDealerIds, nowMs);
  const best = (a, b) =>
    score(b) - score(a) || b.createdAtMs - a.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const byBrand = new Map();
  for (const item of watches) {
    const key = item.brandKey || item.id;
    byBrand.set(key, [...(byBrand.get(key) ?? []), item]);
  }
  const lists = [...byBrand.values()].map((list) => list.sort(best));
  const depth = Math.max(0, ...lists.map((list) => list.length));
  const ordered = [];
  for (let round = 0; round < depth; round += 1) {
    ordered.push(...lists.map((list) => list[round]).filter(Boolean).sort(best));
  }
  return ordered;
}

test('three shops: the first 20 and first 50 show more shops than brand rounds did', (t) => {
  const bigBrands = ['rolex', 'omega', 'tudor', ...Array.from({ length: 37 }, (_, index) => `house${index}`)];
  const big = bigBrands.flatMap((brand) =>
    [0, 1].map((copy) =>
      watch({ id: `big-${brand}-${copy}`, brandKey: brand, dealerId: 'big', createdAtMs: NOW - 2 * DAY }),
    ),
  );
  const medium = Array.from({ length: 10 }, (_, index) =>
    watch({
      id: `medium-${index}`,
      brandKey: ['rolex', 'omega', 'tudor'][index % 3],
      dealerId: 'medium',
      createdAtMs: NOW - 20 * DAY,
    }),
  );
  const small = Array.from({ length: 3 }, (_, index) =>
    watch({ id: `small-${index}`, brandKey: 'seiko', dealerId: 'small', createdAtMs: NOW - 60 * DAY }),
  );
  const pile = [...big, ...medium, ...small];
  const shops = (order, size) => shopCounts(order.map((item) => item.dealerId), size).size;

  const before = orderBeforeShopTurns(pile, taste(), NOW);
  const after = orderFeed(pile, taste(), NOW);
  assert.equal(after.length, pile.length);
  for (const size of [20, 50]) {
    t.diagnostic(`first ${size}: ${shops(before, size)} shop(s) before, ${shops(after, size)} after`);
    assert.ok(shops(after, size) > shops(before, size), `the first ${size} seat more shops`);
  }
  assert.deepEqual(after.slice(0, 3).map((item) => item.dealerId), ['big', 'medium', 'small']);
});

test('a cold start prefers a recent priced watch and still applies a follow', () => {
  const fresh = watch({
    id: 'fresh',
    brandKey: 'omega',
    createdAtMs: NOW - DAY,
    priceCents: 400_000,
    photoCount: 3,
  });
  const stale = watch({
    id: 'stale',
    brandKey: 'rolex',
    createdAtMs: NOW - 120 * DAY,
    priceCents: null,
    photoCount: 0,
  });
  const ordered = orderFeed([stale, fresh], taste(), NOW);
  assert.equal(ordered[0].id, 'fresh');
  assert.ok(scoreWatch(fresh, tasteWeights(taste()), new Set(), NOW) > scoreWatch(stale, tasteWeights(taste()), new Set(), NOW));

  const bench = watch({ id: 'bench', brandKey: 'tudor', dealerId: 'bench', createdAtMs: NOW - 40 * DAY });
  const cold = watch({ id: 'cold', brandKey: 'zenith', dealerId: 'cold', createdAtMs: NOW - 40 * DAY });
  const withFollow = orderFeed([cold, bench], taste({ followedDealerIds: new Set(['bench']) }), NOW);
  assert.equal(withFollow[0].id, 'bench');
});

test('a guest pick and a sign-up brand are a prior, weaker than a click', () => {
  assert.ok(RANK.brandPick < RANK.click);
  assert.ok(RANK.brandPick > RANK.save);
  const picked = watch({ id: 'picked', brandKey: 'rolex' });
  const other = watch({ id: 'other', brandKey: 'omega' });
  const ordered = orderFeed(
    [other, picked],
    taste({ seed: { brands: ['Rolex'], styles: [], priceBand: null } }),
    NOW,
  );
  assert.equal(ordered[0].brandKey, 'rolex');
  assert.equal(brandKey('Universal Genève'), 'universalgeneve');
});

test('a followed new watch leads a brand the buyer clicked once', () => {
  const clicked = watch({
    id: 'clicked',
    brandKey: 'movado',
    style: 'chronograph',
    priceCents: 1_600_000,
    createdAtMs: NOW - 40 * DAY,
  });
  const fixture = watch({
    id: 'fixture',
    brandKey: 'fixture',
    style: null,
    priceCents: 125_000,
    createdAtMs: NOW - DAY,
    dealerId: 'bench',
  });
  const ordered = orderFeed(
    [clicked, fixture],
    taste({
      events: [{ kind: 'dealer_click', listingId: 'clicked', at: 1 }],
      watched: new Map([['clicked', clicked]]),
      followedDealerIds: new Set(['bench']),
    }),
    NOW,
  );
  assert.equal(ordered[0].id, 'fixture');
  const weights = tasteWeights(
    taste({
      events: [{ kind: 'dealer_click', listingId: 'clicked', at: 1 }],
      watched: new Map([['clicked', clicked]]),
    }),
  );
  assert.equal(weights.brand.get('movado'), RANK.click);
  assert.equal(weights.style.get('chronograph'), RANK.clickFacet);
  assert.equal(weights.band.get('high'), RANK.clickFacet);
});

const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);

function definition(name) {
  const pattern = new RegExp(`create (or replace )?function public\\.${name}\\(`);
  const file = readdirSync(MIGRATIONS)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .filter((entry) => pattern.test(readFileSync(new URL(entry, MIGRATIONS), 'utf8')))
    .at(-1);
  assert.ok(file, `no migration creates ${name}`);
  return readFileSync(new URL(file, MIGRATIONS), 'utf8');
}

test('the database functions use these weights and seats', () => {
  const taste = definition('buyer_taste');
  assert.match(taste, new RegExp(`when 'dealer_click' then ${RANK.click}`));
  assert.match(taste, new RegExp(`when 'save' then ${RANK.save}`));
  assert.match(taste, new RegExp(`when 'pass' then ${RANK.pass}`));
  assert.match(taste, new RegExp(`when 'dealer_click' then ${RANK.clickFacet}`));
  assert.match(taste, new RegExp(`when 'save' then ${RANK.saveFacet}`));
  assert.match(taste, new RegExp(`when 'pass' then ${RANK.passFacet}`));
  assert.match(taste, /public\.net_taste_actions\(/);
  assert.match(taste, /join public\.listings l on l\.id = s\.listing_id/);

  const net = definition('net_taste_actions');
  assert.match(net, /kind = 'undo'/);
  assert.match(net, /kind = 'unsave'/);
  assert.match(net, /stack\[index\] = 'save'/);

  const weights = definition('rank_weights');
  assert.match(weights, /public\.buyer_taste\(\)/);
  assert.match(weights, new RegExp(`${RANK.brandPick}`));
  assert.match(weights, new RegExp(`${RANK.stylePick}`));
  assert.match(weights, new RegExp(`${RANK.bandPick}`));
  assert.match(weights, /rank_bump\(weights, 'style', item,/);
  assert.match(weights, /rank_bump\(weights, 'band', band,/);

  const feedSql = definition('rank_buy_feed');
  assert.match(feedSql, new RegExp(`then ${RANK.follow}`));
  assert.match(feedSql, new RegExp(`then ${RANK.price}`));
  assert.match(feedSql, new RegExp(`then ${RANK.recent}`));
  assert.match(feedSql, new RegExp(`then ${RANK.month}`));
  assert.match(feedSql, new RegExp(`then ${RANK.quarter}`));
  assert.match(feedSql, new RegExp(`least\\(matched.photos, ${RANK.photoCap}\\) \\* ${RANK.photo}`));
  assert.match(feedSql, /interval '7 days'/);
  assert.match(feedSql, /interval '30 days'/);
  assert.match(feedSql, /interval '90 days'/);
  assert.match(feedSql, /from public\.shop_mix\(/);
  assert.match(feedSql, /l\.photo_count as photos/);
  assert.match(feedSql, /public\.listing_matches\(l, args\.spec\)/);
  assert.match(feedSql, /public\.rank_open_cursor\(p_cursor, coalesce\(p_seed, '\{\}'::jsonb\)\)/);
  assert.match(feedSql, /\(select w\.taste from weights w\)/);
  assert.doesNotMatch(feedSql, /group by p\.listing_id/);

  const mixSql = definition('shop_mix');
  assert.match(mixSql, /coalesce\(nullif\(i\.brand_key, ''\), i\.id::text\) as brand/);
  assert.match(mixSql, /partition by items\.dealer_id, items\.brand\s+order by items\.score desc, items\.created_at desc, items\.id/);
  assert.match(mixSql, /partition by turned\.dealer_id\s+order by turned\.brand_turn, turned\.score desc, turned\.created_at desc, turned\.id/);

  const newSql = definition('latest_catalogue_batch');
  assert.match(newSql, /join public\.shop_mix\(/);
  assert.match(newSql, /'score', 0/);
  assert.match(newSql, /order by mixed\.slot, on_deck\.created_at desc, on_deck\.id/);
});

test('buyer_taste still scores only the signed-in account', () => {
  const sql = definition('buyer_taste');
  assert.match(sql, /e\.user_id = caller\.uid/);
  assert.doesNotMatch(sql, /or e\.user_id is null/);
});

test('guest writes are capped and unclaimed rows expire after 180 days', () => {
  const guest = definition('log_guest_events');
  assert.match(guest, /2000/);
  assert.match(guest, /20000/);
  const purge = definition('purge_unclaimed_guest_events');
  assert.match(purge, /interval '180 days'/);
});
