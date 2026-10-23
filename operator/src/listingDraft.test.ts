import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centsToDollars, draftFrom, editsFrom, isEdits } from './listingDraft.ts';

test('cents become the dollars a person would type', () => {
  assert.equal(centsToDollars(1250000), '12500');
  assert.equal(centsToDollars(1250050), '12500.50');
  assert.equal(centsToDollars(null), '');
});

test('an empty price is unknown, not zero', () => {
  const edits = editsFrom({
    ...draftFrom({
      brand: 'Omega',
      model: null,
      reference: null,
      year: null,
      case_size_mm: null,
      price_cents: null,
      condition: null,
      description: null,
    }),
    brand: 'Omega',
  });
  assert.equal(isEdits(edits), true);
  if (!isEdits(edits)) return;
  assert.equal(edits.p_price_cents, null);
  assert.equal(edits.p_model, null);
});

test('dollars with a comma become cents', () => {
  const edits = editsFrom({
    brand: 'Rolex',
    model: 'Explorer',
    reference: '1016',
    year: '1967',
    size: '36',
    price: '$12,500',
    condition: 'Very good',
    description: '',
  });
  assert.equal(isEdits(edits), true);
  if (!isEdits(edits)) return;
  assert.equal(edits.p_price_cents, 1_250_000);
  assert.equal(edits.p_year, 1967);
  assert.equal(edits.p_case_size_mm, 36);
  assert.equal(edits.p_description, null);
});

test('a missing brand is refused before it reaches the database', () => {
  const edits = editsFrom({
    brand: '   ',
    model: '',
    reference: '',
    year: '',
    size: '',
    price: '',
    condition: '',
    description: '',
  });
  assert.equal(isEdits(edits), false);
  if (isEdits(edits)) return;
  assert.match(edits.error, /brand/);
});

test('a negative price is refused', () => {
  const edits = editsFrom({
    brand: 'Omega',
    model: '',
    reference: '',
    year: '',
    size: '',
    price: '-1',
    condition: '',
    description: '',
  });
  assert.equal(isEdits(edits), false);
});
