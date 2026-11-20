import assert from 'node:assert/strict';
import { test } from 'node:test';

import { refreshExitCode } from './refresh-run.mjs';
import {
  QUIET_NIGHTS,
  healthReport,
  isSchemaMiss,
  quietStreak,
  refreshRunRow,
  shopFlags,
} from './refresh-health.mjs';

const SHOP = {
  ok: true,
  fatal: false,
  skipped: false,
  dealerId: '11111111-1111-1111-1111-111111111111',
  website: 'https://goldfingersvintage.com',
  error: null,
  publishError: null,
  status: 200,
  found: 40,
  changed: 0,
  added: 0,
  retired: 0,
  relisted: 0,
  published: 0,
  listingsSkipped: 1,
  pending: 0,
  complete: true,
};

function quietRun(over = {}) {
  return { ok: true, skipped: false, added: 0, changed: 0, published: 0, error: null, ...over };
}

test('a refresh row keeps the listing skip count apart from the skipped-shop flag', () => {
  const row = refreshRunRow({ ...SHOP, skipped: false, listingsSkipped: 4, published: 2 });
  assert.equal(row.skipped, false);
  assert.equal(row.skipped_listings, 4);
  assert.equal(row.published, 2);
  assert.equal(row.ok, true);
});

test('a publish failure is stored as not ok, with the publish error', () => {
  const row = refreshRunRow({ ...SHOP, ok: true, publishError: 'OPENAI_API_KEY is not set.' });
  assert.equal(row.ok, false);
  assert.equal(row.error, 'OPENAI_API_KEY is not set.');
});

test('seven quiet nights flag, six do not, and a skipped night in between does not reset', () => {
  const six = Array.from({ length: 6 }, () => quietRun());
  assert.equal(quietStreak(six), 6);
  assert.equal(shopFlags(SHOP, six, null).some((flag) => flag.kind === 'quiet'), false);

  const seven = [quietRun({ skipped: true }), ...Array.from({ length: QUIET_NIGHTS }, () => quietRun())];
  assert.equal(quietStreak(seven), QUIET_NIGHTS);
  const flags = shopFlags(SHOP, seven, null);
  assert.equal(flags.filter((flag) => flag.kind === 'quiet').length, 1);
});

test('a night that published something ends the quiet streak', () => {
  const runs = [quietRun(), quietRun({ published: 2 }), quietRun(), quietRun()];
  assert.equal(quietStreak(runs), 1);
});

test('two runs on the same UTC day count as one night', () => {
  const runs = [
    quietRun({ finished_at: '2026-10-23T18:00:00.000Z' }),
    quietRun({ finished_at: '2026-10-23T06:00:00.000Z' }),
    ...Array.from({ length: 5 }, (_, index) =>
      quietRun({ finished_at: `2026-10-${String(22 - index).padStart(2, '0')}T06:00:00.000Z` })
    ),
  ];
  assert.equal(quietStreak(runs), 6);
  assert.equal(shopFlags(SHOP, runs, null).some((flag) => flag.kind === 'quiet'), false);
});

test('an error, an empty catalogue, and missing photos are separate warnings', () => {
  const failed = shopFlags(
    { ...SHOP, ok: false, found: 0, error: 'CPU Time exceeded (HTTP 546)' },
    [quietRun({ ok: false, error: 'CPU Time exceeded' })],
    null
  );
  assert.deepEqual(
    failed.map((flag) => flag.kind),
    ['error']
  );

  const empty = shopFlags({ ...SHOP, found: 0 }, [quietRun()], {
    missing_photos: 2,
    photo_count: 10,
    published_listings: 5,
  });
  assert.deepEqual(
    empty.map((flag) => flag.kind),
    ['empty', 'photos']
  );

  const wiped = shopFlags({ ...SHOP, found: 0, retired: 85 }, [quietRun()], null);
  assert.equal(wiped[0].detail, 'catalogue read returned 0 listings and retired 85');
});

test('a refused shop is not a health failure', () => {
  assert.deepEqual(shopFlags({ ...SHOP, skipped: true, ok: true }, [], null), []);
});

test('one shop failing is still listed in the health report and fails the job', () => {
  const failed = { ...SHOP, ok: false, error: 'HTTP 546' };
  const healthy = { ...SHOP, dealerId: '22222222-2222-2222-2222-222222222222', website: 'https://oldschoolseconds.com' };
  const report = healthReport([
    { label: failed.website, flags: shopFlags(failed, [], null) },
    { label: healthy.website, flags: shopFlags(healthy, [quietRun({ published: 1 })], null) },
  ]);

  assert.equal(refreshExitCode([failed, healthy]), 1);
  assert.match(report.text, /errors \(1\)/);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].title, 'ShopHealth');
});

test('a missing ledger is a schema-cache miss, not a shop failure', () => {
  assert.equal(isSchemaMiss({ code: 'PGRST205', message: 'refresh_runs' }, 404), true);
  assert.equal(isSchemaMiss({ code: 'PGRST116' }, 406), false);
  const report = healthReport([], ['Refresh history is not on this database yet.']);
  assert.match(report.text, /nothing to flag/);
  assert.match(report.text, /not on this database yet/);
  assert.equal(report.warnings.length, 0);
});
