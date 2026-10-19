import type { ReactNode } from 'react';
import { View } from 'react-native';

import { inset, radius, space, stack, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Body for one Seller Hub tab. */
export function HubPanel({
  fill,
  children,
}: {
  fill?: boolean;
  children: ReactNode;
}) {
  const styles = useThemedStyles(panelStyles);
  return <View style={[styles.panel, fill && styles.fill]}>{children}</View>;
}

const panelStyles = (theme: Theme) => ({
  panel: {
    borderRadius: radius.md,
    backgroundColor: theme.color.surface,
    paddingHorizontal: inset.card,
    paddingVertical: space.md,
    gap: stack.related,
  },
  fill: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden' as const,
  },
});
