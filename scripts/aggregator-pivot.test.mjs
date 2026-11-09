import assert from 'node:assert/strict';
import test from 'node:test';

import { gridColumnsFor } from '../src/lib/gridColumns.ts';
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

test('a wide window keeps a saved count and otherwise follows the automatic count', () => {
  assert.equal(gridColumnsFor(true, 3, 6), 6);
  assert.equal(gridColumnsFor(true, 9, null), 9);
  assert.equal(gridColumnsFor(true, 4, null), 4);
  assert.equal(gridColumnsFor(true, 1, null), 2);
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
