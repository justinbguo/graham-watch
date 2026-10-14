import { Platform, useWindowDimensions } from 'react-native';

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

/**
 * Wide browser window: sign-in is a landing wall, not guest browse. Phone and
 * narrow web keep the sheet-over-deck path. Native wide (iPad) stays guest-first.
 */
export function useDesktopSignInWall() {
  const isWide = useIsWide();
  return Platform.OS === 'web' && isWide;
}
