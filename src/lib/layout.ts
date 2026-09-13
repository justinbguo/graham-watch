import { useWindowDimensions } from 'react-native';

import { WIDE_BREAKPOINT } from '@/lib/design';

/**
 * Below the breakpoint a thumb can reach the whole screen, so the swipe deck is
 * the right interaction to open on. Above it the user has a mouse and would
 * rather scan a grid.
 */
export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
