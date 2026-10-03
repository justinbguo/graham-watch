import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countsLine, stageOf, type StageInput } from './stage.ts';

const shop = (change: Partial<StageInput> = {}): StageInput => ({
  permission: 'pending',
  can_import: true,
  listings_held: 0,
  catalog_queued: 0,
  ...change,
});

test('a new shop asks for watches', () => {
  assert.deepEqual(stageOf(shop()), {
    label: 'Needs watches',
    tone: 'wait',
    primary: 'pick',
    quiet: null,
  });
});

test('imported and unpublished asks to publish', () => {
  const stage = stageOf(shop({ listings_held: 12 }));
  assert.equal(stage.primary, 'publish');
  assert.equal(stage.label, 'Ready to publish');
});

test('a stopped import asks to finish it, and can still publish', () => {
  const stage = stageOf(shop({ listings_held: 12, catalog_queued: 3 }));
  assert.equal(stage.primary, 'pick');
  assert.equal(stage.quiet, 'publish');
  assert.equal(stage.label, '3 still queued');
});

test('a live shop is never pulled back by its solid button', () => {
  const stage = stageOf(shop({ permission: 'approved', listings_held: 12, catalog_queued: 3 }));
  assert.equal(stage.label, 'Live');
  assert.equal(stage.primary, null);
  assert.equal(stage.quiet, 'pull-back');
});

test('a pulled-back shop says so and offers publish', () => {
  const stage = stageOf(shop({ permission: 'revoked', listings_held: 4 }));
  assert.equal(stage.label, 'Pulled back');
  assert.equal(stage.primary, 'publish');
});

test('a claimed shop never offers to pick watches', () => {
  for (const permission of ['pending', 'approved', 'revoked'] as const) {
    const stage = stageOf(shop({ can_import: false, permission, listings_held: 0 }));
    assert.notEqual(stage.primary, 'pick');
    assert.notEqual(stage.quiet, 'pick');
  }
});

test('counts read as one line', () => {
  assert.equal(
    countsLine({ listings_in_deck: 12, listings_held: 40, catalog_total: 79 }),
    '12 in the deck · 40 imported · 79 for sale'
  );
});
