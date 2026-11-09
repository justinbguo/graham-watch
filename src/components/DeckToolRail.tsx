import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { layout, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Desktop web tool column. `dealers` is the Buy rail: wide enough for the shop list. */
export function DeckToolRail({
  children,
  width = 'tools',
}: PropsWithChildren<{ width?: 'tools' | 'dealers' }>) {
  const styles = useThemedStyles(railStyles);
  return <View style={[styles.rail, width === 'dealers' && styles.dealers]}>{children}</View>;
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
  dealers: {
    width: layout.dealerRail,
  },
  tools: {
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
});
