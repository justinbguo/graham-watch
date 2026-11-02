/**
 * How the Buy deck asks for the next page.
 *
 * `search_listings` returns one page. The pile used to be that page and nothing
 * else: after about twenty swipes the screen was empty even though `matched`
 * said more watches fit the filters. A refill asks for the next page while a
 * few cards are still in hand, so the pile never has to hit the table.
 */

export const DECK_LIMIT = 20;

/** Fetch the next page once the pile is this thin, while the top card is still up. */
export const DECK_REFILL_AT = 5;

export type DeckPile<T> = {
  cards: T[];
  /**
   * Rows the server has returned for this filter. Swipes take cards out of
   * `cards` but not out of `seen`: a guest's next page is addressed by this
   * count, and the server still has the rows they already judged.
   */
  seen: number;
  /** The last page was short, or it repeated cards we already hold. */
  exhausted: boolean;
};

export function deckPileFromPage<T>(page: readonly T[], limit: number): DeckPile<T> {
  return {
    cards: [...page],
    seen: page.length,
    exhausted: page.length < limit,
  };
}

export function dropJudgedCard<T extends { id: string }>(pile: DeckPile<T>, listingId: string): DeckPile<T> {
  if (!pile.cards.some((card) => card.id === listingId)) return pile;
  return { ...pile, cards: pile.cards.filter((card) => card.id !== listingId) };
}

/** Undo puts the watch back on top. `seen` stays: the row was already fetched. */
export function restorePassedCard<T extends { id: string }>(
  pile: DeckPile<T> | undefined,
  card: T,
): DeckPile<T> {
  if (!pile) return { cards: [card], seen: 1, exhausted: false };
  if (pile.cards.some((entry) => entry.id === card.id)) return pile;
  return { ...pile, cards: [card, ...pile.cards] };
}

export function appendDeckPage<T extends { id: string }>(
  pile: DeckPile<T>,
  page: readonly T[],
  limit: number,
): DeckPile<T> {
  const have = new Set(pile.cards.map((card) => card.id));
  const added = page.filter((card) => {
    if (have.has(card.id)) return false;
    have.add(card.id);
    return true;
  });
  // A page of cards we already hold did not move the window. Counting it in
  // `seen` would skip rows, and asking again would spin on the same offset.
  if (added.length === 0) return { ...pile, exhausted: true };
  return {
    cards: [...pile.cards, ...added],
    seen: pile.seen + page.length,
    exhausted: page.length < limit,
  };
}

/**
 * Refill when the pile is down to its last few cards and the catalogue still
 * has more matches than we have loaded.
 *
 * `matched` is the live count: `listing_counts`, then one less on every swipe.
 * `seen` still includes those swipes. Putting the judgments back
 * (`matched + seen - remaining`) is what "more matches than the cards loaded
 * so far" means. Comparing the live count to `seen` directly stops a signed-in
 * pile on the second page, because every swipe lowered `matched` and left `seen`
 * where it was.
 */
export function shouldRefillDeck(input: {
  remaining: number;
  matched: number | undefined;
  seen: number;
  exhausted?: boolean;
}): boolean {
  if (input.exhausted) return false;
  if (input.matched == null) return false;
  if (input.remaining > DECK_REFILL_AT) return false;
  const judged = Math.max(0, input.seen - input.remaining);
  const matchedWhenLoaded = input.matched + judged;
  return matchedWhenLoaded > input.seen;
}

/**
 * The empty copy is the end of the catalogue. An empty pile while `matched` is
 * still above zero is a refill that has not landed, not "nothing left".
 */
export function showDeckEmpty(remaining: number, matched: number | undefined): boolean {
  return remaining === 0 && matched === 0;
}

/**
 * Signed-in search drops rows already in `swipes`, so the cards still in hand
 * are the start of the next result. A guest's judgments never reach that
 * table — there is no account, so `auth.uid()` is null — and the same offset
 * repeats the first page. Guests advance by every row already returned.
 */
export function nextDeckOffset(input: { guest: boolean; seen: number; remaining: number }): number {
  return input.guest ? input.seen : input.remaining;
}
