import assert from 'node:assert/strict';
import test from 'node:test';

import {
  judgeAction,
  nextPending,
  parseGuestSwipes,
  parsePendingSave,
  settlement,
} from '../src/features/auth/guestLedger.ts';

const NOW = Date.UTC(2026, 10, 12, 17, 0, 0);
const MINUTE = 60 * 1000;

const hold = (overrides = {}) => ({
  eventId: 'event-1',
  listing: { id: 'listing-1', dealer_id: 'dealer-1' },
  surface: 'buy',
  heldAt: NOW - MINUTE,
  ...overrides,
});
const stored = (swipes) => JSON.stringify({ swipes });

test('a guest save asks, a guest pass and a signed-in save are recorded', () => {
  assert.equal(judgeAction(false, 'right'), 'ask');
  assert.equal(judgeAction(false, 'left'), 'record');
  assert.equal(judgeAction(true, 'right'), 'record');
  assert.equal(judgeAction(true, 'left'), 'record');
});

test('a held save older than the email link reads as none', () => {
  const old = hold({ heldAt: NOW - 61 * MINUTE });
  const recent = hold({ heldAt: NOW - 59 * MINUTE });

  assert.equal(parsePendingSave(JSON.stringify(old), NOW), null);
  assert.deepEqual(parsePendingSave(JSON.stringify(recent), NOW), recent);
});

test('a held save with an unknown surface, no dealer id, or broken JSON reads as none', () => {
  assert.equal(parsePendingSave(JSON.stringify(hold({ surface: 'search' })), NOW), null);
  assert.equal(parsePendingSave(JSON.stringify(hold({ listing: { id: 'listing-1' } })), NOW), null);
  assert.equal(parsePendingSave('{"eventId":', NOW), null);
  assert.equal(parsePendingSave(null, NOW), null);
});

test('a watch passed and then saved settles as one right row', () => {
  const swipes = parseGuestSwipes(
    stored([
      { listingId: 'listing-1', direction: 'left' },
      { listingId: 'listing-2', direction: 'left' },
    ]),
  );
  const { rows } = settlement(swipes, hold());

  assert.deepEqual(rows, [
    { listingId: 'listing-1', direction: 'right' },
    { listingId: 'listing-2', direction: 'left' },
  ]);
});

test('the held save is logged under its own id and the time of the gesture', () => {
  const pending = hold({ eventId: 'held-id', surface: 'detail', heldAt: NOW - 30 * MINUTE });
  const { rows, save } = settlement([], pending);

  assert.deepEqual(rows, [{ listingId: 'listing-1', direction: 'right' }]);
  assert.deepEqual(save, {
    event: { kind: 'save', surface: 'detail', listing: { id: 'listing-1', dealer_id: 'dealer-1' } },
    at: { id: 'held-id', occurredAt: NOW - 30 * MINUTE },
  });
});

test('a right stored before saves asked still settles as right and is not an event', () => {
  const swipes = parseGuestSwipes(stored([{ listingId: 'legacy', direction: 'right' }]));
  const { rows, save } = settlement(swipes, null);

  assert.deepEqual(rows, [{ listingId: 'legacy', direction: 'right' }]);
  assert.equal(save, null);
});

test('finish clears only the save that settled; decline clears; place replaces', () => {
  const older = hold({ eventId: 'older' });
  const newer = hold({ eventId: 'newer', listing: { id: 'listing-2', dealer_id: 'dealer-2' } });

  assert.equal(nextPending(newer, { type: 'finish', eventId: 'older' }), newer, 'a newer hold outlives an older settle');
  assert.equal(nextPending(older, { type: 'finish', eventId: 'older' }), null);
  assert.equal(nextPending(older, { type: 'decline' }), null);
  assert.equal(nextPending(older, { type: 'place', save: newer }), newer);
});
