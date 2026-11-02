/**
 * Promoting the next card must not move the native views already on screen.
 *
 * The old stack rendered `slice(0, 3).reverse()`, so the top card was the last
 * child. Removing it shifted both survivors to a new index. Those moves are
 * what rebuilt the shadow and rebound the gesture. Slots keep survivors put.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { assignDeckSlots, deckCardZ, DECK_STACK } from '../src/features/deck/stack.ts';

function card(id) {
  return { id };
}

function ids(slots) {
  return slots.map((slot) => slot?.id ?? null);
}

/** How many survivors change index when the top card is rendered last. */
function reversedMoves(before, after) {
  const prev = [...before].reverse();
  const next = [...after].reverse();
  let moves = 0;
  for (const id of before) {
    if (!after.includes(id)) continue;
    if (prev.indexOf(id) !== next.indexOf(id)) moves += 1;
  }
  return moves;
}

function slotMoves(before, after) {
  let moves = 0;
  for (const id of before) {
    if (id == null || !after.includes(id)) continue;
    if (before.indexOf(id) !== after.indexOf(id)) moves += 1;
  }
  return moves;
}

test('the first pile fills three slots in deck order', () => {
  const slots = assignDeckSlots([null, null, null], [card('a'), card('b'), card('c')], DECK_STACK, new Set());
  assert.deepEqual(ids(slots), ['a', 'b', 'c']);
});

test('a right swipe fills the hole and does not move the cards that stay', () => {
  const before = [card('a'), card('b'), card('c')];
  const after = assignDeckSlots(before, [card('b'), card('c'), card('d')], DECK_STACK, new Set());
  assert.deepEqual(ids(after), ['d', 'b', 'c']);
  assert.equal(slotMoves(ids(before), ids(after)), 0);
  assert.equal(reversedMoves(['a', 'b', 'c'], ['b', 'c', 'd']), 2);
});

test('a card still leaving keeps its slot so the exit is not cut', () => {
  const before = [card('a'), card('b'), card('c')];
  const flying = assignDeckSlots(before, [card('b'), card('c'), card('d')], DECK_STACK, new Set(['a']));
  assert.deepEqual(ids(flying), ['a', 'b', 'c']);
  assert.equal(deckCardZ('a', ['b', 'c', 'd'], new Set(['a'])), DECK_STACK + 1);
  assert.equal(deckCardZ('b', ['b', 'c', 'd'], new Set(['a'])), DECK_STACK);

  const landed = assignDeckSlots(flying, [card('b'), card('c'), card('d')], DECK_STACK, new Set());
  assert.deepEqual(ids(landed), ['d', 'b', 'c']);
  assert.equal(slotMoves(['a', 'b', 'c'], ids(landed)), 0);
});

test('swiping the new top while the previous card is still leaving keeps both', () => {
  let slots = [card('a'), card('b'), card('c')];
  slots = assignDeckSlots(slots, [card('b'), card('c'), card('d')], DECK_STACK, new Set(['a']));
  slots = assignDeckSlots(slots, [card('c'), card('d'), card('e')], DECK_STACK, new Set(['a', 'b']));
  assert.deepEqual(ids(slots), ['a', 'b', 'c']);
  assert.equal(deckCardZ('c', ['c', 'd', 'e'], new Set(['a', 'b'])), DECK_STACK);
});

test('undo puts the watch back in a hole without moving the others', () => {
  const flying = assignDeckSlots(
    [card('d'), card('b'), card('c')],
    [card('b'), card('c'), card('e')],
    DECK_STACK,
    new Set(),
  );
  assert.deepEqual(ids(flying), ['e', 'b', 'c']);
  const undone = assignDeckSlots(flying, [card('d'), card('b'), card('c')], DECK_STACK, new Set());
  assert.deepEqual(ids(undone), ['d', 'b', 'c']);
  assert.equal(slotMoves(ids(flying), ids(undone)), 0);
});

test('a shorter pile leaves a hole instead of sliding the survivors down', () => {
  const slots = assignDeckSlots([card('a'), card('b'), card('c')], [card('b')], DECK_STACK, new Set());
  assert.deepEqual(ids(slots), [null, 'b', null]);
});
