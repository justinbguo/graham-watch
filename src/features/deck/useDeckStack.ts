import { useState } from 'react';

import { assignDeckSlots, DECK_STACK } from './stack';

function sameIds<T extends { id: string }>(a: readonly (T | null)[], b: readonly (T | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i]?.id ?? null) !== (b[i]?.id ?? null)) return false;
  }
  return true;
}

/**
 * The mounted stack. Slot identity lives across renders so a swipe does not
 * reorder the native views of the cards that stay.
 */
export function useDeckStack<T extends { id: string }>(cards: readonly T[], retainIds: ReadonlySet<string>) {
  const window = cards.slice(0, DECK_STACK);
  const [slots, setSlots] = useState<(T | null)[]>(() => Array.from({ length: DECK_STACK }, () => null));
  const next = assignDeckSlots(slots, window, DECK_STACK, retainIds);
  // Adjusting state while rendering is how this stays in lockstep with the
  // pile without an effect that would paint one frame of the old order.
  if (!sameIds(slots, next)) setSlots(next);
  return { slots: next, window };
}
