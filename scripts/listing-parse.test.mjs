import assert from 'node:assert/strict';
import test from 'node:test';

import { dealerListingChanges } from '../shared/listingParse.ts';

const draft = {
  brand: 'Omega',
  model: 'Seamaster',
  reference: '165.024',
  year: '1968',
  caliber: '',
  condition: '',
  price: '12500',
  currency: 'USD',
  caseSize: '36',
  description: '',
  sourceUrl: '',
  winding: null,
  caseMaterial: null,
  dialColor: null,
  style: null,
  complications: [],
  hasBox: null,
  hasPapers: null,
};

test('a year of 12 does not save', () => {
  const changes = dealerListingChanges({ ...draft, year: '12' });
  assert.equal('error' in changes, true);
  if (!('error' in changes)) return;
  assert.equal(changes.error, 'That year is not a watch.');
});

test('a negative price does not save', () => {
  const changes = dealerListingChanges({ ...draft, price: '-1' });
  assert.equal('error' in changes, true);
});

test('a real year and price become the columns', () => {
  const changes = dealerListingChanges(draft);
  assert.equal('error' in changes, false);
  if ('error' in changes) return;
  assert.equal(changes.year, 1968);
  assert.equal(changes.price_cents, 1_250_000);
  assert.equal(changes.brand, 'Omega');
});
