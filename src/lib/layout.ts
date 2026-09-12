import { useWindowDimensions } from 'react-native';

// Below this a thumb can reach the whole screen, so the swipe deck is the right
// interaction to open on. Above it the user has a mouse and would rather scan a
// grid. Only the starting view; either one is reachable at any width.
const WIDE_BREAKPOINT = 900;

export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
