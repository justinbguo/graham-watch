import type { PropsWithChildren, ReactNode } from 'react';
import { View } from 'react-native';

import { desktopSplitMain } from '@/lib/desktopSplit';
import { useIsDesktopWeb } from '@/lib/layout';
import { space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Desktop Buy: tool column beside the deck. Top edges align with `main`. */
export function DeckDesktopFrame({
  rail,
  children,
}: PropsWithChildren<{
  rail: ReactNode;
}>) {
  const isDesktopWeb = useIsDesktopWeb();
  const styles = useThemedStyles(frameStyles);

  if (!isDesktopWeb) {
    return children;
  }

  return (
    <View style={styles.row}>
      <View style={styles.rail}>{rail}</View>
      <View style={styles.main}>{children}</View>
    </View>
  );
}

const frameStyles = (theme: Theme) => ({
  row: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    minHeight: 0,
  },
  rail: {
    flexShrink: 0,
    alignSelf: 'stretch' as const,
    paddingRight: space.xs,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    ...desktopSplitMain(theme),
  },
});
