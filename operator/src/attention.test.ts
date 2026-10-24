import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attentionItems, type AttentionDealer, type AttentionInput } from './attention.ts';
import type { RefreshRun } from './refreshHealth.ts';

const NOW = Date.parse('2026-10-24T08:00:00Z');

function dealer(over: Partial<AttentionDealer> = {}): AttentionDealer {
  return {
    id: 'shop-1',
    name: 'Goldfinger',
    website: 'https://goldfingersvintage.com',
    permission: 'approved',
    neglect_flags: [],
    unanswered_count: 0,
    listings_missing_photos: 0,
    ...over,
  };
}

function run(over: Partial<RefreshRun> = {}): RefreshRun {
  return {
    dealer_id: 'shop-1',
    dealer_name: 'Goldfinger',
    finished_at: '2026-10-24T06:00:00Z',
    ok: true,
    fatal: false,
    skipped: false,
    error: null,
    ...over,
  };
}

function items(over: Partial<AttentionInput> = {}) {
  return attentionItems({
    now: NOW,
    applications: [],
    dealers: [dealer()],
    runs: [run()],
    stale: [],
    ...over,
  });
}

test('a clean day with one fresh shop is an empty list', () => {
  assert.deepEqual(items(), []);
});

test('pending applications, quiet dealers, and unanswered threads each become a row', () => {
  const rows = items({
    applications: [{ id: 'app-1', shop_name: 'Desk', created_at: '2026-10-20T00:00:00Z' }],
    dealers: [
      dealer({
        neglect_flags: ['unclaimed', 'quiet'],
        unanswered_count: 2,
      }),
    ],
  });
  assert.deepEqual(rows.map((row) => row.kind), ['application', 'unanswered', 'quiet']);
  assert.match(rows[1].detail, /2 inquiries or threads/);
  assert.equal(rows[2].dealerId, 'shop-1');
});

test('unclaimed alone is not attention', () => {
  const rows = items({ dealers: [dealer({ neglect_flags: ['unclaimed'] })] });
  assert.deepEqual(rows, []);
});

test('a missing ledger is one row, not one row per shop', () => {
  const rows = items({
    runs: [],
    dealers: [dealer(), dealer({ id: 'shop-2', name: 'Old School', website: 'https://oldschoolseconds.com' })],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'refresh_missing');
});

test('an unavailable ledger is not reported as missing', () => {
  const rows = items({ runs: [], runsUnavailable: true });
  assert.deepEqual(rows, []);
});

test('a failed night names the run and the shop, and a shop the run skipped', () => {
  const rows = items({
    runs: [run({ ok: false, fatal: true, error: 'OpenAI returned 401' })],
    dealers: [
      dealer(),
      dealer({ id: 'shop-2', name: 'Old School', website: 'https://oldschoolseconds.com' }),
      dealer({ id: 'shop-3', name: 'Paused', website: 'https://paused.example', permission: 'paused' }),
    ],
  });
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['refresh_failed', 'refresh_dealer', 'refresh_dealer'],
  );
  assert.equal(rows[1].dealerId, 'shop-1');
  assert.match(rows[1].detail, /401/);
  assert.equal(rows[2].label, 'Old School');
  assert.equal(rows.some((row) => row.label === 'Paused'), false);
});

test('listing problems are approved shops only', () => {
  const rows = items({
    dealers: [
      dealer({ listings_missing_photos: 3 }),
      dealer({ id: 'shop-2', name: 'Paused', permission: 'paused', listings_missing_photos: 4, website: 'https://paused.example' }),
    ],
    stale: [{ dealer_id: 'shop-1', name: 'Goldfinger', stale_count: 5 }],
  });
  assert.deepEqual(rows.map((row) => row.kind), ['listing_photo', 'listing_stale']);
  assert.match(rows[0].detail, /3 active listings with no photo/);
  assert.match(rows[1].detail, /5 active listings not availability-checked/);
});
