import { useWindowDimensions } from 'react-native';

import { inset, layout, WIDE_BREAKPOINT } from '@/lib/design';

/** End-to-end width of the swipe card: column minus the deck's side gutters. */
export function deckContentWidth(windowWidth: number, insetLeft: number, insetRight: number) {
  const column = Math.min(windowWidth - insetLeft - insetRight, layout.card);
  return column - inset.screen * 2;
}

/**
 * Below the breakpoint a thumb can reach the whole screen, so the swipe deck is
 * the right interaction to open on. Above it the user has a mouse and would
 * rather scan a grid.
 */
export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
