import assert from 'node:assert/strict';
import { test } from 'node:test';

import { additionTitle, lastSyncCell, lastSyncDetail, lastSyncLabel } from './lastSync.ts';

test('a shop with no catalogue read reads as never, not zero', () => {
  const cell = lastSyncCell(null, 0);
  assert.equal(cell.kind, 'never');
  assert.equal(lastSyncLabel(cell), 'Never');
  assert.match(lastSyncDetail(cell), /No catalogue read yet/);
});

test('a catalogue read that added nothing reads as zero', () => {
  const cell = lastSyncCell('2026-11-07T12:00:00.000Z', 0);
  assert.equal(cell.kind, 'zero');
  assert.equal(lastSyncLabel(cell), '0');
  assert.match(lastSyncDetail(cell), /did not create a listing/);
});

test('a catalogue read that added watches shows that count', () => {
  const cell = lastSyncCell('2026-11-07T12:00:00.000Z', 3);
  assert.deepEqual(cell, { kind: 'count', count: 3 });
  assert.equal(lastSyncLabel(cell), '3');
  assert.equal(lastSyncDetail(cell), '3 watches first seen on the last catalogue read.');
  assert.equal(
    lastSyncDetail(lastSyncCell('2026-11-07T12:00:00.000Z', 1)),
    '1 watch first seen on the last catalogue read.',
  );
});

test('a missing sync wins over a stray count', () => {
  assert.equal(lastSyncCell(undefined, 4).kind, 'never');
});

test('the watch title is the brand and model buyers already see', () => {
  assert.equal(additionTitle('Rolex', 'Datejust'), 'Rolex Datejust');
  assert.equal(additionTitle('Rolex', null), 'Rolex');
  assert.equal(additionTitle('  ', ''), 'Untitled');
});
