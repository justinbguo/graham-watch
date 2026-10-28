import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dealerLastSyncAt,
  lastSyncTone,
  refreshAlert,
  refreshIsStale,
  shopRefreshStale,
} from './refreshSchedule.ts';

const now = Date.parse('2026-10-24T12:00:00.000Z');

test('stale when older than 24 hours', () => {
  assert.equal(refreshIsStale('2026-10-22T12:00:00.000Z', now), true);
  assert.equal(refreshIsStale('2026-10-23T13:00:00.000Z', now), false);
  assert.equal(refreshIsStale(null, now), true);
});

test('empty ledger with approved shops is an error when stale', () => {
  const alert = refreshAlert(
    {
      last_success_at: null,
      last_attempt_at: null,
      last_attempt_ok: null,
      last_attempt_error: null,
      recorded_runs: 0,
      approved_shops: 3,
      last_catalog_sync_at: '2026-10-17T00:00:00.000Z',
    },
    now,
  );
  assert.equal(alert.level, 'error');
  assert.match(alert.title, /No refresh history/);
});

test('healthy ledger shows last success', () => {
  const alert = refreshAlert(
    {
      last_success_at: '2026-10-24T06:00:00.000Z',
      last_attempt_at: '2026-10-24T06:00:00.000Z',
      last_attempt_ok: true,
      last_attempt_error: null,
      recorded_runs: 40,
      approved_shops: 5,
      last_catalog_sync_at: '2026-10-24T06:00:00.000Z',
    },
    now,
  );
  assert.equal(alert.level, 'ok');
});

test('last sync tone uses a 48 hour window', () => {
  assert.equal(lastSyncTone('2026-10-23T12:00:00.000Z', now), 'ok');
  assert.equal(lastSyncTone('2026-10-22T11:59:00.000Z', now), 'stale');
  assert.equal(lastSyncTone(null, now), 'stale');
});

test('dealer last sync is the newer of catalogue read and nightly ok', () => {
  assert.equal(
    dealerLastSyncAt({
      last_refresh_ok_at: '2026-10-20T00:00:00.000Z',
      last_synced_at: '2026-10-23T00:00:00.000Z',
    }),
    '2026-10-23T00:00:00.000Z',
  );
});

test('approved shop is stale without a recent ok refresh', () => {
  assert.equal(
    shopRefreshStale(
      {
        permission: 'approved',
        last_refresh_ok_at: null,
        last_synced_at: '2026-10-17T00:00:00.000Z',
        last_sync_error: null,
      },
      now,
    ),
    true,
  );
});
