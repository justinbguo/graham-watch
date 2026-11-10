/**
 * The buyer event queue's decisions, without a database.
 *
 * A search typed a letter at a time is one filter row. A guest's rows keep
 * the key of the signed-out session they came from, and only the account
 * that claimed them can send them. A dwell carries the furthest photo the
 * buyer paged to on that listing; the Deck's index for the card that just
 * left does not count.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  claimGuest,
  dwellRow,
  enqueue,
  parseGuestBuffer,
  reachPhoto,
  route,
  startExposure,
  toGuestBuffer,
  toRow,
} from '../src/data/listingEventQueue.ts';

const CAP = 500;
const at = (id, now) => ({ id, now, exposureId: null });
const listing = (id) => ({ id, dealer_id: `dealer-of-${id}` });
const entry = (owner, row) => ({ owner, row, retried: false });

test('filter rows waiting to send merge into the first id with the latest spec', () => {
  const typed = ['s', 'sub', 'submariner'].map((query, index) =>
    toRow({ kind: 'filter', surface: 'search', filter: { query } }, at(`search-${index}`, 1000 + index)),
  );
  let queue = [];
  for (const row of typed) queue = enqueue(queue, entry('user-a', row), CAP).queue;

  assert.equal(queue.length, 1);
  assert.equal(queue[0].row.id, 'search-0');
  assert.deepEqual(queue[0].row.filter, { query: 'submariner' });
  assert.equal(queue[0].row.occurred_at, new Date(1002).toISOString());

  const shop = toRow(
    { kind: 'filter', surface: 'shop', dealer: { id: 'shop-1' }, filter: { brands: ['Rolex'] } },
    at('shop-0', 2000),
  );
  const deck = toRow({ kind: 'filter', surface: 'buy', filter: { eras: ['1960s'] } }, at('deck-0', 2001));
  queue = enqueue(queue, entry('user-a', shop), CAP).queue;
  queue = enqueue(queue, entry('user-a', deck), CAP).queue;
  assert.deepEqual(
    queue.map((queued) => queued.row.id),
    ['search-0', 'shop-0', 'deck-0'],
    'another surface or shop is its own row',
  );
});

test("guest rows keep their guest key and are not filed under another account", () => {
  const stored = toRow({ kind: 'pass', surface: 'buy', listing: listing('l1') }, at('guest-pass', 1000));
  const { buffer } = toGuestBuffer(null, [stored], 'guest-key', 100);
  const onDisk = parseGuestBuffer(JSON.stringify(buffer));

  const inMemory = toRow({ kind: 'save', surface: 'buy', listing: listing('l2') }, at('guest-save', 1001));
  const someoneElse = toRow({ kind: 'save', surface: 'detail', listing: listing('l3') }, at('b-save', 1002));
  const claimed = claimGuest(
    [entry('guest', inMemory), entry('user-b', someoneElse)],
    onDisk,
    'minted-key',
    'user-a',
  );

  const guestRows = claimed.filter((queued) => queued.row.id.startsWith('guest-'));
  assert.deepEqual(
    guestRows.map((queued) => [queued.row.id, queued.owner, queued.row.guest_key]),
    [
      ['guest-pass', 'user-a', 'guest-key'],
      ['guest-save', 'user-a', 'guest-key'],
    ],
  );
  const untouched = claimed.find((queued) => queued.row.id === 'b-save');
  assert.equal(untouched.owner, 'user-b');
  assert.equal(untouched.row.guest_key, null);

  const asA = route(claimed, 'user-a');
  assert.deepEqual(asA.send.map((queued) => queued.row.id), ['guest-pass', 'guest-save']);
  const asC = route(claimed, 'user-c');
  assert.equal(asC.send.length, 0, 'a later account sends none of them');
  assert.equal(asC.dropped, 3);
});

test('a dwell keeps the furthest photo paged on its own listing', () => {
  let exposure = startExposure({
    id: 'exposure-1',
    surface: 'buy',
    listing: listing('top'),
    now: 1000,
    tracksPhotos: true,
  });
  for (const photo of [
    { listingId: 'left', index: 6 },
    { listingId: 'top', index: 2 },
    { listingId: 'top', index: 4 },
    { listingId: 'top', index: 1 },
    { listingId: 'top', index: 0 },
  ]) {
    exposure = reachPhoto(exposure, photo);
  }
  const dwell = dwellRow(exposure, { id: 'dwell-1', now: 4500 });

  assert.equal(dwell.photo_index, 4);
  assert.equal(dwell.dwell_ms, 3500);
  assert.equal(dwell.exposure_id, 'exposure-1');
  assert.equal(dwell.listing_id, 'top');

  const firstPhotoOnly = startExposure({
    id: 'exposure-2',
    surface: 'buy_grid',
    listing: listing('tile'),
    now: 0,
    tracksPhotos: false,
  });
  assert.equal(
    dwellRow(reachPhoto(firstPhotoOnly, { listingId: 'tile', index: 3 }), { id: 'dwell-2', now: 1 }).photo_index,
    null,
    'a surface that shows one photo reports none',
  );
});
