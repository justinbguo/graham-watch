import type { InfiniteData } from '@tanstack/react-query';

/**
 * How the Buy deck asks for the next page.
 *
 * `rank_buy_feed` returns one page and an opaque cursor. The cursor is a
 * bookmark the database made for this filter and this taste. The next request
 * sends that string back and does not read it. A cursor from a different
 * order is rejected, so the query key includes the taste: a new taste is a
 * new query, and a new query starts with no cursor.
 *
 * The pile used to be one page and nothing else. After about twenty swipes
 * the screen was empty even though more watches fit the filters. A refill
 * asks for the next page while a few cards are still in hand.
 *
 * The grid shows every card still in the pile, so the pile never gets thin
 * and that refill never runs. The grid asks on its own when the tail of the
 * list is on screen (`shouldLoadMoreGrid`), on this same cursor.
 */

export const DECK_LIMIT = 20;

/** Fetch the next page once the pile is this thin, while the top card is still up. */
export const DECK_REFILL_AT = 5;

/**
 * The deck's order. `search_listings_v2` rejects a cursor built for a
 * different one of these, or for the other favorites-first setting.
 */
export const DECK_SORTS = ['newest', 'price_asc', 'price_desc', 'oldest', 'newest_watch'] as const;

export type DeckSort = (typeof DECK_SORTS)[number];

/** What the deck asks for until a sort control exists. Same order the offset deck used. */
export const DECK_SORT: DeckSort = 'newest';

/** Favorite brands still lead the pile, as they did before the cursor. */
export const DECK_FAVORITES_FIRST = true;

export type DeckPage<T> = {
  cards: T[];
  /**
   * Bookmark for the following page. The same value on every row the database
   * returned, and null when this page is the last. Opaque: pass it back, do
   * not parse it.
   */
  cursor: string | null;
};

/** One deck query: the pages `useInfiniteQuery` stores, keyed with the cursor that fetched each one. */
export type DeckCache<T> = InfiniteData<DeckPage<T>, string | null>;

/**
 * The cursor to ask for next, or nothing when the database said this was the
 * last page. `useInfiniteQuery` treats `undefined` as "stop". Null is what
 * the database sends for that; the two are the same fact.
 */
export function nextDeckCursor(page: { cursor: string | null }): string | undefined {
  return page.cursor ?? undefined;
}

export function cardsInDeck<T extends { id: string }>(data: DeckCache<T> | undefined): T[] {
  if (!data) return [];
  const seen = new Set<string>();
  const cards: T[] = [];
  for (const page of data.pages) {
    for (const card of page.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    }
  }
  return cards;
}

/**
 * Cards the buyer can still judge. A guest's passes never reach `swipes`, so
 * a refetch of a page would hand those watches back. Signed-in swipes are
 * already gone on the server; the set is empty and this is the pile unchanged.
 */
export function visibleDeckCards<T extends { id: string }>(
  data: DeckCache<T> | undefined,
  hiddenIds: ReadonlySet<string>,
): T[] {
  const cards = cardsInDeck(data);
  if (hiddenIds.size === 0) return cards;
  return cards.filter((card) => !hiddenIds.has(card.id));
}

export function deckHasCard<T extends { id: string }>(
  data: DeckCache<T> | undefined,
  listingId: string,
): boolean {
  return data?.pages.some((page) => page.cards.some((card) => card.id === listingId)) ?? false;
}

/**
 * How many cards on the latest page were not already on an earlier page.
 * Zero means the cursor did not move the pile forward. Asking again would
 * spin on the same watches.
 */
export function newCardsOnLastPage<T extends { id: string }>(data: DeckCache<T> | undefined): number | undefined {
  const pages = data?.pages;
  if (!pages?.length) return undefined;
  const last = pages[pages.length - 1];
  const prior = new Set<string>();
  for (const page of pages.slice(0, -1)) {
    for (const card of page.cards) prior.add(card.id);
  }
  let added = 0;
  for (const card of last.cards) {
    if (!prior.has(card.id)) added += 1;
  }
  return added;
}

export function dropJudgedCard<T extends { id: string }>(data: DeckCache<T>, listingId: string): DeckCache<T> {
  let hit = false;
  const pages = data.pages.map((page) => {
    if (!page.cards.some((card) => card.id === listingId)) return page;
    hit = true;
    return { ...page, cards: page.cards.filter((card) => card.id !== listingId) };
  });
  if (!hit) return data;
  return { ...data, pages };
}

/** Undo puts the watch back on top. The page's cursor stays: the row was already fetched. */
export function restorePassedCard<T extends { id: string }>(
  data: DeckCache<T> | undefined,
  card: T,
): DeckCache<T> {
  if (!data) return { pages: [{ cards: [card], cursor: null }], pageParams: [null] };
  if (deckHasCard(data, card.id)) return data;
  const [first, ...rest] = data.pages;
  if (!first) return { ...data, pages: [{ cards: [card], cursor: null }] };
  return { ...data, pages: [{ ...first, cards: [card, ...first.cards] }, ...rest] };
}

/**
 * Refill when the pile is down to its last few cards and the database handed
 * back a cursor.
 *
 * The cursor is null on the last page, so this does not ask again when the
 * catalogue is finished. `matched` is not the signal: it drops on every
 * swipe, and comparing it to "how many rows came back" used to stop a
 * signed-in pile on the second page. The empty state is what reads `matched`.
 */
export function shouldRefillDeck(input: {
  remaining: number;
  hasNextPage: boolean;
  latestPageAdded?: number;
}): boolean {
  if (!input.hasNextPage) return false;
  if (input.latestPageAdded === 0) return false;
  return input.remaining <= DECK_REFILL_AT;
}

/**
 * The empty copy is the end of the catalogue. An empty pile while `matched`
 * is still above zero — or still loading — is a refill that has not landed,
 * not "nothing left". A page that comes back empty is the same: wait for the
 * count, do not treat the page as the answer.
 */
export function showDeckEmpty(remaining: number, matched: number | undefined): boolean {
  return remaining === 0 && matched === 0;
}

/**
 * How close the tail has to be, as a fraction of the viewport, before the
 * grid asks for the next page. Half a screen is soon enough that the next
 * page arrives as the last row comes up, and late enough that opening the
 * grid does not walk the catalogue.
 */
export const GRID_END_THRESHOLD = 0.5;

export type ListScrollMetrics = {
  contentHeight: number;
  viewportHeight: number;
  offsetY: number;
};

/**
 * The tail is on screen, or the list is shorter than the screen and there
 * is nowhere to scroll. A viewport that has not been laid out yet is not
 * the end — that measurement is 0, and treating it as the end would ask
 * for every page on mount.
 */
export function isNearListEnd(metrics: ListScrollMetrics, threshold = GRID_END_THRESHOLD): boolean {
  const { contentHeight, viewportHeight, offsetY } = metrics;
  if (!(viewportHeight > 0) || !(contentHeight > 0) || !Number.isFinite(offsetY)) return false;
  const distanceFromEnd = contentHeight - viewportHeight - offsetY;
  return distanceFromEnd <= viewportHeight * threshold;
}

/**
 * The grid's ask. The card view uses `shouldRefillDeck` instead, because a
 * swipe throws a watch away and the pile gets thin. The grid keeps every
 * watch, so "five left" never happens.
 *
 * Nothing in flight: a scroll event fires for every frame the tail is
 * visible, and a second request would repeat the page. A failed page stays
 * failed until Try again — calling again here would spin on the same
 * cursor. Zero new cards means the cursor did not move the pile forward.
 */
export function shouldLoadMoreGrid(input: {
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  latestPageAdded?: number;
}): boolean {
  if (!input.hasNextPage) return false;
  if (input.isFetchNextPageError) return false;
  if (input.isFetching || input.isFetchingNextPage) return false;
  if (input.latestPageAdded === 0) return false;
  return true;
}

/** What the grid needs from the deck query in order to turn the page. */
export type GridPaging = {
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  latestPageAdded?: number;
  onLoadMore: () => void;
  /** The tally, once the count has landed. The footer has its own line until then. */
  endLabel?: string;
};
