import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diffFeed, feedAvailable, feedKept } from './catalogue-audit.mjs';

test('a for-sale watch the feed has and the catalogue does not is a miss', () => {
  const diff = diffFeed(
    [{ id: 'shopify:1', available: true, kept: true, handle: 'submariner' }],
    []
  );
  assert.equal(diff.missedForSale, 1);
  assert.deepEqual(diff.missedExamples, ['submariner']);
});

test('a listing sold for absence while the feed still sells it is a false sold', () => {
  const diff = diffFeed(
    [{ id: 'shopify:1', available: true, kept: true, handle: 'daytona' }],
    [
      {
        externalId: 'shopify:1',
        available: true,
        hold: false,
        listingSoldMissing: true,
      },
    ]
  );
  assert.equal(diff.soldButFeedAvailable, 1);
  assert.equal(diff.missedForSale, 0);
});

test('a strap the feed still sells is not a missed watch', () => {
  assert.equal(feedKept({ title: 'Watch Strap', handle: 'strap', images: [{}], product_type: 'Strap' }), false);
  assert.equal(feedAvailable({ variants: [{ available: false }] }), false);
  assert.equal(feedAvailable({ variants: [{ available: true }, { available: false }] }), true);
});

test('a catalogue row the finished feed no longer lists is still for sale on our side', () => {
  const diff = diffFeed(
    [],
    [{ externalId: 'shopify:9', available: true, hold: false, listingSoldMissing: false }]
  );
  assert.equal(diff.storedForSaleMissingFromFeed, 1);
});
