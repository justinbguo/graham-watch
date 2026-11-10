/**
 * The Buy score. A click beats a save, an undo drops the action it takes
 * back, a followed shop scores higher than the same watch unfollowed, a
 * loved brand does not take the whole top of the feed, and an empty history
 * still orders the pile.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RANK,
  brandKey,
  emptyTaste,
  orderFeed,
  scoreWatch,
  tasteWeights,
} from '../src/data/rank.ts';

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

test('one loved brand does not take the whole top of the feed', () => {
  const rolex = Array.from({ length: 6 }, (_, index) =>
    watch({ id: `rolex-${index}`, brandKey: 'rolex', createdAtMs: NOW - index * 1000 }),
  );
  const omega = Array.from({ length: 6 }, (_, index) =>
    watch({
      id: `omega-${index}`,
      brandKey: 'omega',
      dealerId: 'shop-o',
      createdAtMs: NOW - index * 1000,
    }),
  );
  const ordered = orderFeed(
    [...rolex, ...omega],
    taste({
      events: [{ kind: 'dealer_click', listingId: 'rolex-0', at: 1 }],
      watched: new Map([['rolex-0', rolex[0]]]),
    }),
    NOW,
  );
  const top = ordered.slice(0, 4).map((item) => item.brandKey);
  assert.equal(top[0], 'rolex');
  assert.equal(new Set(top).size, 2);
  assert.ok(top.includes('omega'));
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

test('the database function uses these weights', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261110230000_rank_buy_feed.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, new RegExp(`when 'dealer_click' then ${RANK.click}`));
  assert.match(sql, new RegExp(`when 'save' then ${RANK.save}`));
  assert.match(sql, new RegExp(`when 'pass' then ${RANK.pass}`));
  assert.match(sql, new RegExp(`when 'dealer_click' then ${RANK.clickFacet}`));
  assert.match(sql, new RegExp(`when 'save' then ${RANK.saveFacet}`));
  assert.match(sql, new RegExp(`when 'pass' then ${RANK.passFacet}`));
  assert.match(sql, /rank_bump\(weights, 'style', sty, facet\)/);
  assert.match(sql, /rank_bump\(weights, 'band', band, facet\)/);
  assert.match(sql, new RegExp(`then ${RANK.follow}`));
  assert.match(sql, new RegExp(`then ${RANK.price}`));
  assert.match(sql, new RegExp(`then ${RANK.recent}`));
  assert.match(sql, new RegExp(`then ${RANK.month}`));
  assert.match(sql, new RegExp(`then ${RANK.quarter}`));
  assert.match(sql, new RegExp(`least\\(matched.photos, ${RANK.photoCap}\\) \\* ${RANK.photo}`));
  assert.match(sql, new RegExp(`${RANK.brandPick}`));
  assert.match(sql, new RegExp(`${RANK.stylePick}`));
  assert.match(sql, new RegExp(`${RANK.bandPick}`));
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /interval '90 days'/);
  assert.match(sql, /partition by coalesce\(scored.brand_key, scored.id::text\)/);
  assert.match(sql, /ev.kind = 'undo'/);
});
