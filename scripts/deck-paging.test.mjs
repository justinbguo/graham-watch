/**
 * The Buy deck pages with the cursor `search_listings_v2` returns.
 *
 * One page of 20 used to be the whole pile: after those swipes the screen
 * said the catalogue was finished even when `matched` was still above zero.
 * A refill asks for the next page while five or fewer cards are in hand.
 * The cursor is a bookmark. The client sends it back and does not read it.
 * A different filter or sort is a different query, so it starts with no cursor.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NO_FILTERS } from '../src/features/filters/types.ts';
import { countsCacheKey, deckCacheKey } from '../src/features/filters/spec.ts';
import {
  DECK_FAVORITES_FIRST,
  DECK_LIMIT,
  DECK_SORT,
  cardsInDeck,
  dropJudgedCard,
  newCardsOnLastPage,
  nextDeckCursor,
  restorePassedCard,
  shouldRefillDeck,
  showDeckEmpty,
  visibleDeckCards,
} from '../src/data/deckPaging.ts';

function createCatalogue(total) {
  const serverId = `srv-${(createCatalogue.nextId = (createCatalogue.nextId ?? 0) + 1)}`;
  const rows = Array.from({ length: total }, (_, index) => ({
    id: String(index).padStart(3, '0'),
  }));
  let minted = 0;
  const endIndex = new Map();

  function page({ cursor, judged, guest }) {
    if (cursor != null && !endIndex.has(cursor)) {
      throw new Error(`cursor was not issued for this catalogue: ${cursor}`);
    }
    const start = cursor == null ? 0 : endIndex.get(cursor) + 1;
    const rest = [];
    for (let index = start; index < rows.length; index += 1) {
      const card = rows[index];
      if (!guest && judged.has(card.id)) continue;
      rest.push({ card, index });
    }
    const slice = rest.slice(0, DECK_LIMIT);
    const more = rest.length > DECK_LIMIT;
    let next = null;
    if (more && slice.length > 0) {
      next = `${serverId}-cursor-${slice[slice.length - 1].index}-${minted++}`;
      endIndex.set(next, slice[slice.length - 1].index);
    }
    return { cards: slice.map((item) => item.card), cursor: next };
  }

  return { page };
}

function swipeCatalogue({ total, guest, refill }) {
  const server = createCatalogue(total);
  const judged = new Set();
  const sent = [];
  const refillAt = [];
  let data;
  let matched = total;

  function hidden() {
    return guest ? judged : new Set();
  }

  function take(cursor) {
    sent.push(cursor);
    const page = server.page({ cursor, judged, guest });
    data = data
      ? { pages: [...data.pages, page], pageParams: [...data.pageParams, cursor] }
      : { pages: [page], pageParams: [cursor] };
    return page;
  }

  take(null);
  const shown = [];
  let guard = 0;

  while (guard++ < total * 4 + 5) {
    const visible = visibleDeckCards(data, hidden());
    const hasNext = nextDeckCursor(data.pages[data.pages.length - 1]) !== undefined;
    if (
      refill &&
      shouldRefillDeck({
        remaining: visible.length,
        hasNextPage: hasNext,
        latestPageAdded: newCardsOnLastPage(data),
      })
    ) {
      refillAt.push(visible.length);
      const cursor = nextDeckCursor(data.pages[data.pages.length - 1]);
      const before = visible.length;
      const page = take(cursor);
      const after = visibleDeckCards(data, hidden()).length;
      if (after === before && page.cursor === cursor) break;
      continue;
    }
    if (visible.length === 0) break;
    const [card] = visible;
    shown.push(card.id);
    judged.add(card.id);
    data = dropJudgedCard(data, card.id);
    matched -= 1;
  }

  return {
    shown,
    matched,
    sent,
    refillAt,
    stuck: visibleDeckCards(data, hidden()).length === 0 && matched > 0,
  };
}

test('the cursor is passed through and null ends the pages', () => {
  const cursor = 'opaque-bookmark-that-is-not-parsed';
  assert.equal(nextDeckCursor({ cursor }), cursor);
  assert.equal(nextDeckCursor({ cursor: null }), undefined);
  assert.equal(nextDeckCursor({ cursor: '' }), '');
});

test('without a refill the deck stops after the first page of 20', () => {
  const stalled = swipeCatalogue({ total: 45, guest: false, refill: false });
  assert.equal(stalled.shown.length, DECK_LIMIT);
  assert.equal(stalled.matched, 25);
  assert.equal(stalled.stuck, true);
  assert.deepEqual(stalled.sent, [null]);
  // The pile is empty and 25 matches are still out there. That is not the
  // empty state — the empty state is a catalogue of zero. A count that has
  // not loaded yet is not zero either, and neither is an empty page by itself.
  assert.equal(showDeckEmpty(0, stalled.matched), false);
  assert.equal(showDeckEmpty(0, 0), true);
  assert.equal(showDeckEmpty(0, undefined), false);
  assert.equal(showDeckEmpty(3, 0), false);
});

test('a signed-in deck refills when 5 cards are left, using the returned cursor', () => {
  assert.equal(shouldRefillDeck({ remaining: 5, hasNextPage: true, latestPageAdded: 20 }), true);
  assert.equal(shouldRefillDeck({ remaining: 0, hasNextPage: true, latestPageAdded: 20 }), true);
  assert.equal(shouldRefillDeck({ remaining: 6, hasNextPage: true, latestPageAdded: 20 }), false);
  assert.equal(shouldRefillDeck({ remaining: 5, hasNextPage: false, latestPageAdded: 20 }), false);
  assert.equal(shouldRefillDeck({ remaining: 5, hasNextPage: true, latestPageAdded: 0 }), false);

  const walked = swipeCatalogue({ total: 45, guest: false, refill: true });
  assert.equal(walked.stuck, false);
  assert.equal(walked.shown.length, 45);
  assert.deepEqual(new Set(walked.shown).size, 45);
  assert.deepEqual(walked.refillAt, [5, 5]);
  assert.equal(walked.sent[0], null);
  assert.equal(typeof walked.sent[1], 'string');
  assert.equal(typeof walked.sent[2], 'string');
  assert.equal(walked.sent.length, 3);
  assert.equal(showDeckEmpty(0, walked.matched), true);
});

test('a guest deck refills on the same cursors, and a pass does not come back', () => {
  const signedIn = swipeCatalogue({ total: 45, guest: false, refill: true });
  const guest = swipeCatalogue({ total: 45, guest: true, refill: true });
  assert.equal(guest.stuck, false);
  assert.equal(guest.shown.length, 45);
  assert.deepEqual(new Set(guest.shown).size, 45);
  assert.deepEqual(guest.refillAt, [5, 5]);
  // A guest has no swipe rows. The old offset deck had to skip ahead by every
  // row already returned, or page two was page one again. The cursor is that
  // skip for both, so both walks hand the server the bookmark for the same
  // row. The token itself differs per server; the position in it is the
  // fake server's, and the client never reads it.
  const position = (cursor) => {
    if (cursor == null) return null;
    const match = /^srv-\d+-cursor-(\d+)-\d+$/.exec(cursor);
    assert.ok(match);
    return Number(match[1]);
  };
  assert.deepEqual(guest.sent.map(position), signedIn.sent.map(position));
  assert.deepEqual(signedIn.sent.map(position), [null, 19, 39]);

  const page = {
    pages: [
      { cards: [{ id: 'a' }, { id: 'b' }], cursor: 'from-server' },
    ],
    pageParams: [null],
  };
  const visible = visibleDeckCards(page, new Set(['a']));
  assert.deepEqual(visible.map((card) => card.id), ['b']);
});

test('one page that already holds every match does not ask for another', () => {
  const walked = swipeCatalogue({ total: DECK_LIMIT, guest: false, refill: true });
  assert.deepEqual(walked.sent, [null]);
  assert.equal(walked.shown.length, DECK_LIMIT);
  assert.equal(walked.stuck, false);
  assert.equal(showDeckEmpty(0, walked.matched), true);
});

test('a repeated page does not spin the refill, and a swipe removes the card once', () => {
  const data = {
    pages: [
      { cards: [{ id: 'a' }, { id: 'b' }], cursor: 'c1' },
      { cards: [{ id: 'b' }, { id: 'c' }], cursor: 'c2' },
    ],
    pageParams: [null, 'c1'],
  };
  assert.deepEqual(
    cardsInDeck(data).map((card) => card.id),
    ['a', 'b', 'c'],
  );
  assert.equal(newCardsOnLastPage(data), 1);
  const repeated = {
    pages: [...data.pages, { cards: [{ id: 'b' }, { id: 'c' }], cursor: 'c3' }],
    pageParams: [...data.pageParams, 'c2'],
  };
  assert.equal(newCardsOnLastPage(repeated), 0);
  assert.equal(
    shouldRefillDeck({ remaining: 1, hasNextPage: true, latestPageAdded: newCardsOnLastPage(repeated) }),
    false,
  );

  const dropped = dropJudgedCard(data, 'b');
  assert.deepEqual(
    cardsInDeck(dropped).map((card) => card.id),
    ['a', 'c'],
  );
  assert.equal(dropped.pages[0].cursor, 'c1');
  assert.equal(dropped.pages[1].cursor, 'c2');
  assert.equal(dropJudgedCard(dropped, 'missing'), dropped);

  const restored = restorePassedCard(dropped, { id: 'b' });
  assert.deepEqual(
    cardsInDeck(restored).map((card) => card.id),
    ['b', 'a', 'c'],
  );
  assert.equal(restored.pages[0].cursor, 'c1');
  assert.equal(restorePassedCard(restored, { id: 'b' }), restored);
});

test('changing filter or sort is a new query and does not reuse the cursor', () => {
  assert.equal(DECK_SORT, deckCacheKey(null)[2]);
  assert.equal(DECK_FAVORITES_FIRST, deckCacheKey(null)[3]);

  const newest = deckCacheKey({ brands: ['rolex'] }, 'newest', true);
  const byPrice = deckCacheKey({ brands: ['rolex'] }, 'price_asc', true);
  const byAge = deckCacheKey({ brands: ['rolex'] }, 'oldest', true);
  const tudor = deckCacheKey({ brands: ['tudor'] }, 'newest', true);
  const favoritesOff = deckCacheKey({ brands: ['rolex'] }, 'newest', false);
  assert.notDeepEqual(newest, byPrice);
  assert.notDeepEqual(newest, byAge);
  assert.notDeepEqual(newest, tudor);
  assert.notDeepEqual(newest, favoritesOff);
  // Counts ignore sort. A swipe still updates the one count for this filter.
  assert.equal(newest[1], byPrice[1]);
  assert.deepEqual(countsCacheKey(newest[1]), ['listing-counts', newest[1]]);
  assert.deepEqual(
    deckCacheKey({ brands: ['tudor', 'rolex'] }, 'price_desc', true),
    deckCacheKey({ brands: ['rolex', 'tudor'] }, 'price_desc', true),
  );

  const newestServer = createCatalogue(45);
  const priceServer = createCatalogue(45);
  const first = newestServer.page({ cursor: null, judged: new Set(), guest: false });
  const bookmark = nextDeckCursor(first);
  assert.equal(typeof bookmark, 'string');
  // The new key starts at the first page. The price server has never issued
  // the newest bookmark, and rejects it — which is what the database does.
  const restarted = priceServer.page({ cursor: null, judged: new Set(), guest: false });
  assert.equal(restarted.cards[0].id, '000');
  assert.throws(() => priceServer.page({ cursor: bookmark, judged: new Set(), guest: false }));

  const listings = readFileSync(new URL('../src/data/listings.ts', import.meta.url), 'utf8');
  assert.match(listings, /useInfiniteQuery</);
  assert.match(listings, /useInfiniteQuery<[^;]{0,500}string \| null/);
  assert.match(listings, /initialPageParam: null,/);
  assert.match(listings, /getNextPageParam: \(lastPage\) => nextDeckCursor\(lastPage\)/);
  assert.match(listings, /queryFn: \(\{ pageParam \}\) => fetchDeckPage\(limit, filters, pageParam, sort, favoritesFirst\)/);
  assert.match(listings, /rpc\('search_listings_v2'/);
  assert.match(listings, /rpc\('listing_counts_v2'/);
  assert.match(listings, /p_cursor: cursor/);
  assert.match(listings, /p_spec: canonicalize\(filters\)\.spec as Json/);
  assert.equal(listings.includes("rpc('search_listings'"), false);
  assert.equal(listings.includes("rpc('listing_counts'"), false);
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
  assert.match(keysSource, /deckCacheKey\(filters, sort, favoritesFirst\)/);
  assert.match(keysSource, /counts: \(filters: unknown\) => countsCacheKey\(filters\)/);
});
