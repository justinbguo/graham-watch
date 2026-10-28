import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shopErrors, visibleDealers, type DealerRow } from './dealerTable.ts';

function shop(partial: Partial<DealerRow> & Pick<DealerRow, 'id' | 'name'>): DealerRow {
  return {
    website: null,
    permission: 'approved',
    created_at: '2026-10-01T00:00:00.000Z',
    listings_held: 0,
    last_refresh_error: null,
    last_sync_error: null,
    neglect_flags: [],
    ...partial,
  };
}

const rows = [
  shop({ id: 'a', name: 'Alpha', permission: 'pending', neglect_flags: ['unclaimed'], listings_held: 2 }),
  shop({
    id: 'b',
    name: 'Beta',
    permission: 'approved',
    listings_held: 10,
    last_refresh_error: 'timeout',
    neglect_flags: ['quiet', 'unanswered'],
    created_at: '2026-10-02T00:00:00.000Z',
  }),
  shop({ id: 'c', name: 'Gamma', permission: 'paused', website: 'https://gamma.test' }),
];

test('the error text is the refresh error and the sync error, once each', () => {
  assert.deepEqual(
    shopErrors({ last_refresh_error: 'timeout', last_sync_error: 'timeout' }),
    ['timeout'],
  );
  assert.deepEqual(shopErrors({ last_refresh_error: 'a', last_sync_error: 'b' }), ['a', 'b']);
});

test('neglected keeps a shop with any flag', () => {
  const shown = visibleDealers(rows, '', 'all', 'neglected', 'newest').map((row) => row.id);
  assert.deepEqual(shown, ['b', 'a']);
});

test('unanswered is its own filter', () => {
  const shown = visibleDealers(rows, '', 'all', 'unanswered', 'newest').map((row) => row.id);
  assert.deepEqual(shown, ['b']);
});

test('last error is its own filter', () => {
  assert.deepEqual(visibleDealers(rows, '', 'all', 'last_error', 'newest').map((row) => row.id), ['b']);
});

test('status and the search box both narrow the list', () => {
  assert.deepEqual(visibleDealers(rows, '', 'paused', 'all', 'newest').map((row) => row.id), ['c']);
  assert.deepEqual(visibleDealers(rows, 'gamma.test', 'all', 'all', 'newest').map((row) => row.id), ['c']);
});

test('listing count puts the fuller shop first', () => {
  assert.deepEqual(visibleDealers(rows, '', 'all', 'all', 'listings').map((row) => row.id), ['b', 'a', 'c']);
});

test('last error sorts shops that failed above shops that did not', () => {
  assert.equal(visibleDealers(rows, '', 'all', 'all', 'last_error')[0]?.id, 'b');
});

test('last sync puts the oldest sync first', () => {
  const withSync = [
    shop({ id: 'old', name: 'Old', last_synced_at: '2026-10-01T00:00:00.000Z' }),
    shop({ id: 'new', name: 'New', last_synced_at: '2026-10-24T00:00:00.000Z' }),
  ];
  const sorted = visibleDealers(withSync, '', 'all', 'all', 'last_sync').map((row) => row.id);
  assert.deepEqual(sorted, ['old', 'new']);
});

