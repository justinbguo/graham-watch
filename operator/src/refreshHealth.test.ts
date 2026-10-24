import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupRuns, refreshBanner, shopProblems, type RefreshRun } from './refreshHealth.ts';

const NOW = Date.parse('2026-10-24T08:00:00Z');

function run(over: Partial<RefreshRun> = {}): RefreshRun {
  return {
    dealer_id: '11111111-1111-1111-1111-111111111111',
    dealer_name: 'Goldfinger',
    finished_at: '2026-10-24T06:00:00Z',
    ok: true,
    fatal: false,
    skipped: false,
    error: null,
    ...over,
  };
}

test('shops that finish together are one run, newest first', () => {
  const groups = groupRuns([
    run({ finished_at: '2026-10-23T06:00:00Z', dealer_name: 'Older' }),
    run({ dealer_id: '22222222-2222-2222-2222-222222222222', dealer_name: 'Zed', ok: false, error: 'dns' }),
    run({ dealer_name: 'Goldfinger' }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].finished_at, '2026-10-24T06:00:00Z');
  assert.equal(groups[0].ok, 1);
  assert.equal(groups[0].error, 1);
  assert.equal(groups[0].fatal, 0);
  assert.deepEqual(groups[0].shops.map((shop) => shop.dealer_name), ['Goldfinger', 'Zed']);
});

test('a fatal shop is not also counted as an error', () => {
  const groups = groupRuns([
    run({ fatal: true, ok: false, error: 'Not authorized.' }),
    run({ dealer_id: '22222222-2222-2222-2222-222222222222', dealer_name: 'Old School', skipped: true, ok: true }),
  ]);
  assert.deepEqual(
    { ok: groups[0].ok, fatal: groups[0].fatal, error: groups[0].error, skipped: groups[0].skipped },
    { ok: 0, fatal: 1, error: 0, skipped: 1 },
  );
  assert.deepEqual(shopProblems(groups[0]), ['Goldfinger — Not authorized.']);
});

test('an empty ledger is a missing refresh, not a success', () => {
  const banner = refreshBanner([], NOW);
  assert.equal(banner.tone, 'bad');
  assert.equal(banner.title, 'No refresh recorded');
  assert.equal(banner.missing, true);
  assert.match(banner.detail, /different clock/);
});

test('a run older than 24 hours is missing, and the last success is still named', () => {
  const banner = refreshBanner([run({ finished_at: '2026-10-23T06:00:00Z' })], NOW);
  assert.equal(banner.title, 'No refresh in the last 24 hours');
  assert.equal(banner.tone, 'bad');
  assert.match(banner.detail, /Last success 26h ago/);
});

test('a fatal shop in the last day fails the banner even when another shop was read', () => {
  const banner = refreshBanner(
    [
      run(),
      run({
        dealer_id: '22222222-2222-2222-2222-222222222222',
        dealer_name: 'Old School',
        fatal: true,
        ok: false,
        error: 'OpenAI returned 401',
      }),
    ],
    NOW,
  );
  assert.equal(banner.tone, 'bad');
  assert.equal(banner.title, 'Last refresh failed');
  assert.match(banner.detail, /1 ok, 1 fatal, 0 errors in the last 24 hours/);
});

test('one shop error is a warning, and a clean night names the last success', () => {
  const warned = refreshBanner(
    [run(), run({ dealer_id: '22222222-2222-2222-2222-222222222222', dealer_name: 'Old School', ok: false, error: 'timeout' })],
    NOW,
  );
  assert.equal(warned.tone, 'warn');
  assert.equal(warned.title, 'Refresh finished with shop errors');

  const clean = refreshBanner([run(), run({ dealer_id: '22222222-2222-2222-2222-222222222222', dealer_name: 'Old School' })], NOW);
  assert.equal(clean.tone, 'ok');
  assert.equal(clean.title, 'Last successful refresh');
  assert.equal(clean.detail, '2h ago · 2 shops ok');
});
