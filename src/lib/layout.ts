import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { inset, layout, space, WIDE_BREAKPOINT } from '@/lib/design';

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

/** Wide browser window. Native tablets keep the rail; only web gets the marketplace header. */
export function useIsDesktopWeb() {
  const wide = useIsWide();
  return Platform.OS === 'web' && wide;
}

/** Width of the safe area between horizontal insets. */
export function desktopAvailableWidth(windowWidth: number, insetLeft: number, insetRight: number) {
  return windowWidth - insetLeft - insetRight;
}

/** Desktop web tab column: `layout.desktopColumnShare` of the safe width. */
export function desktopColumnWidth(windowWidth: number, insetLeft: number, insetRight: number) {
  return desktopAvailableWidth(windowWidth, insetLeft, insetRight) * layout.desktopColumnShare;
}

/**
 * Buy grid columns on desktop web. At least `gridColumnsWeb`. Another column
 * opens once a tile would pass `gridTileMax`, so the wall fills the window.
 */
export function desktopGridColumns(windowWidth: number, insetLeft: number, insetRight: number) {
  const rail = layout.deckToolRail + space.lg + space.xs + space.lg;
  const available = Math.max(0, desktopAvailableWidth(windowWidth, insetLeft, insetRight) - rail);
  const columns = Math.ceil((available + space.sm) / (layout.gridTileMax + space.sm));
  return Math.max(layout.gridColumnsWeb, columns);
}

export function useDesktopColumnWidth() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return desktopColumnWidth(width, insets.left, insets.right);
}

/**
 * Desktop tab body width inside `inset.screen` gutters — matches Seller Hub's
 * `HubTabBar` and other padded in-tab nav.
 */
export function desktopContentWidth(windowWidth: number, insetLeft: number, insetRight: number) {
  return desktopColumnWidth(windowWidth, insetLeft, insetRight) - inset.screen * 2;
}

export function useDesktopContentWidth() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return desktopContentWidth(width, insets.left, insets.right);
}
