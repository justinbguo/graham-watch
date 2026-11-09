import assert from 'node:assert/strict';
import test from 'node:test';

import { deckGridFrame, gridColumnsFor } from '../src/lib/gridColumns.ts';
import { listingSourceUrl } from '../src/lib/listingSource.ts';
import { photoWheelStep } from '../src/lib/photoWheel.ts';

test('a blank dealer page hides the link', () => {
  assert.equal(listingSourceUrl(null), null);
  assert.equal(listingSourceUrl('   '), null);
  assert.equal(
    listingSourceUrl(' https://oldschoolseconds.com/products/girard-perregaux-waffle-dial '),
    'https://oldschoolseconds.com/products/girard-perregaux-waffle-dial',
  );
});

test('a phone stays at two columns even when six was saved', () => {
  assert.equal(gridColumnsFor(false, 4, 6), 2);
});

test('a wide window can show six and otherwise stops at six', () => {
  assert.equal(gridColumnsFor(true, 3, 6), 6);
  assert.equal(gridColumnsFor(true, 9, null), 6);
  assert.equal(gridColumnsFor(true, 4, null), 4);
});

test('two and three capped columns sit in the middle of the column', () => {
  for (const columns of [2, 3]) {
    const frame = deckGridFrame({ columns, listWidth: 1730 });
    assert.equal(frame.tileWidth, 480);
    const row = frame.tileWidth * columns + 8 * (columns - 1);
    assert.equal(frame.rowPadLeft + row + frame.rowPadRight, 1730);
    assert.ok(Math.abs(frame.rowPadLeft - frame.rowPadRight) <= 1);
    assert.ok(frame.rowPadLeft > 0);
  }
});

test('a full desktop row keeps a gutter at the window edge', () => {
  const frame = deckGridFrame({ columns: 4, listWidth: 1730 });
  assert.ok(frame.tileWidth < 480);
  assert.equal(frame.rowPadLeft, 0);
  assert.ok(frame.rowPadRight >= 24 && frame.rowPadRight < 28);
  const row = frame.tileWidth * 4 + 8 * 3;
  assert.equal(frame.rowPadLeft + row + frame.rowPadRight, 1730);
});

test('an unmeasured list draws nothing yet', () => {
  const frame = deckGridFrame({ columns: 2, listWidth: 0 });
  assert.equal(frame.tileWidth, 0);
  assert.equal(frame.rowPadLeft, 0);
  assert.equal(frame.rowPadRight, 0);
});

test('a horizontal wheel step changes one photo and a vertical wheel does not', () => {
  const partial = photoWheelStep(20, 0, 0);
  assert.equal(partial.horizontal, true);
  assert.equal(partial.direction, 0);
  const next = photoWheelStep(30, 2, partial.nextAccumulated);
  assert.equal(next.direction, 1);
  const vertical = photoWheelStep(4, 40, 0);
  assert.equal(vertical.horizontal, false);
  assert.equal(vertical.direction, 0);
});
