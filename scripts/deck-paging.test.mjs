/**
 * The Buy deck used to fetch one page of 20 and then show the empty state,
 * even when `listing_counts.matched` said more watches fit the filters.
 * Swiping this catalogue without a refill stops at 20. With a refill it does not.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NO_FILTERS } from '../src/features/filters/types.ts';
import { countsCacheKey, deckCacheKey } from '../src/features/filters/spec.ts';
import {
  appendDeckPage,
  DECK_LIMIT,
  deckPileFromPage,
  dropJudgedCard,
  nextDeckOffset,
  shouldRefillDeck,
  showDeckEmpty,
} from '../src/data/deckPaging.ts';

function swipeCatalogue({ total, guest, refill }) {
  const catalogue = Array.from({ length: total }, (_, index) => ({
    id: String(index).padStart(3, '0'),
  }));
  const judged = new Set();
  const offsets = [];

  const fetchPage = (offset) => {
    offsets.push(offset);
    const rows = guest ? catalogue : catalogue.filter((card) => !judged.has(card.id));
    return rows.slice(offset, offset + DECK_LIMIT);
  };

  let pile = deckPileFromPage(fetchPage(0), DECK_LIMIT);
  let matched = total;
  const shown = [];
  let guard = 0;

  while (guard++ < total * 4 + 5) {
    const remaining = pile.cards.length;
    if (refill && shouldRefillDeck({ remaining, matched, seen: pile.seen, exhausted: pile.exhausted })) {
      const offset = nextDeckOffset({ guest, seen: pile.seen, remaining });
      const page = fetchPage(offset);
      const next = appendDeckPage(pile, page, DECK_LIMIT);
      if (next.seen === pile.seen && next.cards.length === pile.cards.length) break;
      pile = next;
      continue;
    }
    if (pile.cards.length === 0) break;
    const [card] = pile.cards;
    shown.push(card.id);
    judged.add(card.id);
    pile = dropJudgedCard(pile, card.id);
    matched -= 1;
  }

  return {
    shown,
    matched,
    offsets: offsets.slice(1),
    stuck: pile.cards.length === 0 && matched > 0,
  };
}

test('without a refill the deck stops after the first page of 20', () => {
  const stalled = swipeCatalogue({ total: 45, guest: false, refill: false });
  assert.equal(stalled.shown.length, DECK_LIMIT);
  assert.equal(stalled.matched, 25);
  assert.equal(stalled.stuck, true);
  // The pile is empty and 25 matches are still out there. That is not the
  // empty state — the empty state is a catalogue of zero.
  assert.equal(showDeckEmpty(0, stalled.matched), false);
  assert.equal(showDeckEmpty(0, 0), true);
  assert.equal(showDeckEmpty(0, undefined), false);
});

test('a signed-in deck refills when 5 cards are left and more matches are loaded', () => {
  assert.equal(shouldRefillDeck({ remaining: 5, matched: 30, seen: 20, exhausted: false }), true);
  assert.equal(shouldRefillDeck({ remaining: 6, matched: 30, seen: 20, exhausted: false }), false);
  // The five cards in hand are the whole of what is left.
  assert.equal(shouldRefillDeck({ remaining: 5, matched: 5, seen: 20, exhausted: false }), false);

  const walked = swipeCatalogue({ total: 45, guest: false, refill: true });
  assert.equal(walked.stuck, false);
  assert.equal(walked.shown.length, 45);
  assert.deepEqual(walked.offsets, [5, 5]);
  assert.equal(showDeckEmpty(0, walked.matched), true);
});

test('a guest deck refills too, past rows the server still returns', () => {
  const walked = swipeCatalogue({ total: 45, guest: true, refill: true });
  assert.equal(walked.stuck, false);
  assert.equal(walked.shown.length, 45);
  assert.deepEqual(new Set(walked.shown).size, 45);
  // A guest has no swipe rows, so page two starts after the 20 already returned,
  // not after the 5 still in hand. The signed-in offset would repeat page one.
  assert.deepEqual(walked.offsets, [20, 40]);
});

test('one page that already holds every match does not ask for another', () => {
  const walked = swipeCatalogue({ total: DECK_LIMIT, guest: false, refill: true });
  assert.deepEqual(walked.offsets, []);
  assert.equal(walked.shown.length, DECK_LIMIT);
  assert.equal(walked.stuck, false);
});

test('a repeated page does not spin the refill', () => {
  const pile = deckPileFromPage([{ id: 'a' }, { id: 'b' }], DECK_LIMIT);
  const again = appendDeckPage(pile, [{ id: 'a' }, { id: 'b' }], DECK_LIMIT);
  assert.equal(again.seen, pile.seen);
  assert.equal(again.exhausted, true);
  assert.equal(again.cards.length, 2);
});

test('deck and counts keys ignore filter order and defaults', () => {
  const scrambled = {
    query: '  ',
    eras: ['seventies', 'fifties'],
    sizes: ['large'],
    prices: [
      { min: 500_000, max: 1_500_000 },
      { min: null, max: 500_000 },
    ],
    complications: ['chronograph'],
    windings: ['manual', 'automatic'],
    materials: ['gold', 'steel'],
    styles: ['dive', 'dress'],
    dealers: ['b', 'a'],
    brands: ['tudor', 'rolex'],
  };
  const canonical = {
    ...NO_FILTERS,
    brands: ['rolex', 'tudor'],
    dealers: ['a', 'b'],
    styles: ['dive', 'dress'],
    materials: ['gold', 'steel'],
    windings: ['automatic', 'manual'],
    complications: ['chronograph'],
    prices: [
      { min: null, max: 500_000 },
      { min: 500_000, max: 1_500_000 },
    ],
    sizes: ['large'],
    eras: ['fifties', 'seventies'],
  };

  assert.deepEqual(deckCacheKey(scrambled), deckCacheKey(canonical));
  assert.deepEqual(countsCacheKey(scrambled), countsCacheKey(canonical));
  assert.deepEqual(deckCacheKey(scrambled)[1], countsCacheKey(scrambled)[1]);
  assert.deepEqual(deckCacheKey(null), deckCacheKey(NO_FILTERS));
  assert.deepEqual(deckCacheKey({ brands: ['rolex'] }), deckCacheKey({ ...NO_FILTERS, brands: ['rolex'] }));

  // keys.ts is what the deck and the swipe cache actually call. Node cannot
  // load that module (its import has no extension; the app bundler resolves it),
  // so this checks the delegation instead of importing it.
  const keysSource = readFileSync(new URL('../src/data/keys.ts', import.meta.url), 'utf8');
  assert.match(keysSource, /deck: \(filters: unknown = null\) => deckCacheKey\(filters\)/);
  assert.match(keysSource, /counts: \(filters: unknown\) => countsCacheKey\(filters\)/);
});
