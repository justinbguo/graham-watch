import type { ViewStyle } from 'react-native';

import { size, space, type Theme } from '@/lib/theme';

/** Hairline on the left edge of the column beside a desktop rail. */
export function desktopSplitMain(theme: Theme): ViewStyle {
  return {
    borderLeftWidth: size.rule,
    borderLeftColor: theme.color.border,
    paddingLeft: space.lg,
  };
}

/** Hairline on the right edge of a left pane in a desktop split (messages inbox). */
export function desktopSplitRailEdge(theme: Theme): ViewStyle {
  return {
    borderRightWidth: size.rule,
    borderRightColor: theme.color.border,
  };
}
