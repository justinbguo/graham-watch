import { useWindowDimensions } from 'react-native';

// Below this a thumb can reach the whole screen, so the swipe deck is the right
// interaction. Above it the user has a mouse and wants to browse a grid.
const WIDE_BREAKPOINT = 900;

export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
