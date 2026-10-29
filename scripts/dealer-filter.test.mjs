import assert from 'node:assert/strict';
import test from 'node:test';

import { dealerChoices } from '../src/features/filters/dealers.ts';
import { activeCount, NO_FILTERS, toRpcArgs } from '../src/features/filters/types.ts';

const gold = { kind: 'dealer', value: 'gold', label: "Goldfinger's Vintage", count: 54 };
const oldSchool = { kind: 'dealer', value: 'oss', label: 'Old School Seconds', count: 321 };
const rolex = { kind: 'brand', value: 'rolex', label: 'Rolex', count: 12 };

test('deck and search list every dealer the buyer can see, including one', () => {
  assert.deepEqual(
    dealerChoices([rolex, gold], 'deck').map((row) => row.value),
    ['gold'],
  );
  assert.deepEqual(
    dealerChoices([gold, oldSchool], 'search').map((row) => row.label),
    ["Goldfinger's Vintage", 'Old School Seconds'],
  );
});

test('a shop page does not offer a dealer filter', () => {
  assert.deepEqual(dealerChoices([gold, oldSchool], 'shop'), []);
});

test('a chosen dealer counts toward the badge and is sent as p_dealers', () => {
  const filters = { ...NO_FILTERS, dealers: ['gold', 'oss'], brands: ['rolex'] };
  assert.equal(activeCount(filters), 3);
  assert.deepEqual(toRpcArgs(filters).p_dealers, ['gold', 'oss']);
  assert.equal(toRpcArgs(NO_FILTERS).p_dealers, undefined);
  assert.equal(activeCount(NO_FILTERS), 0);
});
