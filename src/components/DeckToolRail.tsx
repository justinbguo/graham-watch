import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { layout, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Desktop web Buy tools: undo, filters, and the view toggle in one column. */
export function DeckToolRail({ children }: PropsWithChildren) {
  const styles = useThemedStyles(railStyles);
  return <View style={styles.rail}>{children}</View>;
}

/** Top stack inside a tool rail: filters, actions, toggles. */
export function DeckRailTools({ children }: PropsWithChildren) {
  const styles = useThemedStyles(railStyles);
  return <View style={styles.tools}>{children}</View>;
}

const railStyles = (_theme: Theme) => ({
  rail: {
    flex: 1,
    minHeight: 0,
    minWidth: layout.deckToolRail,
    alignSelf: 'stretch' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'flex-start' as const,
    gap: space.sm,
    paddingRight: space.lg,
  },
  tools: {
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
});
