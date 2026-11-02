/**
 * Which cards stay mounted under the one being judged, and in which sibling slot.
 *
 * The stack used to be `cards.slice(0, 3).reverse()`, so the top card was the
 * last child. Judging it shifted every card underneath to a new index. React
 * Native moves those views. A move rebuilds the shadow layer — `shadow.card`
 * is a 32px blur, and rasterizing it is the moment the shadow seems to load —
 * and it rebinds the gesture handler, so the card that was already on screen
 * ignores the thumb until that finishes.
 *
 * Survivors keep the slot they were mounted in. A card still flying off keeps
 * its slot too, until the exit animation ends. The card that just entered the
 * window fills a hole. z-index, not sibling order, decides who is on top.
 */

/** How many cards stay mounted. The one in hand, and two behind it. */
export const DECK_STACK = 3;

export function assignDeckSlots<T extends { id: string }>(
  previous: readonly (T | null)[],
  window: readonly T[],
  depth: number,
  retainIds: ReadonlySet<string>,
): (T | null)[] {
  const incoming = new Map(window.map((card) => [card.id, card]));
  const slots: (T | null)[] = Array.from({ length: depth }, () => null);
  const parked = new Set<string>();

  for (let i = 0; i < depth; i++) {
    const prev = previous[i];
    if (!prev) continue;
    const fresh = incoming.get(prev.id);
    if (fresh) {
      slots[i] = fresh;
      parked.add(prev.id);
      continue;
    }
    // Still on its way off the screen. Unmounting it here would cut the exit
    // and move everyone else into its hole.
    if (retainIds.has(prev.id)) {
      slots[i] = prev;
      parked.add(prev.id);
    }
  }

  const newcomers = window.filter((card) => !parked.has(card.id));
  let next = 0;
  for (let i = 0; i < depth && next < newcomers.length; i++) {
    if (slots[i] == null) {
      slots[i] = newcomers[next];
      next += 1;
    }
  }
  return slots;
}

/**
 * Paint order. A card that is still leaving stays above the one that just
 * took the hand, so the exit is visible, and it does not receive touches.
 */
export function deckCardZ(id: string, windowIds: readonly string[], retainIds: ReadonlySet<string>): number {
  if (retainIds.has(id)) return DECK_STACK + 1;
  const index = windowIds.indexOf(id);
  if (index < 0) return 0;
  return DECK_STACK - index;
}
