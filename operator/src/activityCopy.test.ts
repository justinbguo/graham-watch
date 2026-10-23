import assert from 'node:assert/strict';
import { test } from 'node:test';

import { actionLabel, changeSummary } from './activityCopy.ts';

test('a known verb is a sentence', () => {
  assert.equal(actionLabel('pause_shop'), 'Paused a shop');
  assert.equal(actionLabel('hide_listing'), 'Hid a watch');
});

test('a permission change names both sides', () => {
  assert.equal(
    changeSummary({ permission: 'approved' }, { permission: 'paused' }),
    'permission: approved → paused',
  );
});

test('an unchanged field is left out', () => {
  assert.equal(
    changeSummary(
      { brand: 'Omega', reference: '145.012' },
      { brand: 'Omega', reference: '145.022' },
    ),
    'reference: 145.012 → 145.022',
  );
});

test('a delete says the row is gone', () => {
  assert.equal(changeSummary({ brand: 'Omega' }, null), 'brand: Omega → —');
});
