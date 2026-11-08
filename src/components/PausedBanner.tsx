import type { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';

import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export const PAUSED_COPY = "Not in scope right now, but you're free to test.";

/** Sits above a paused screen and does not take taps from the feature under it. */
export function PausedBanner() {
  const styles = useThemedStyles(bannerStyles);
  return (
    <View pointerEvents="none" style={styles.banner}>
      <Text style={styles.label}>{PAUSED_COPY}</Text>
    </View>
  );
}

export function PausedFrame({ children }: PropsWithChildren) {
  const styles = useThemedStyles(bannerStyles);
  return (
    <View style={styles.frame}>
      <PausedBanner />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const bannerStyles = (theme: Theme) => ({
  frame: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  banner: {
    paddingHorizontal: inset.screen,
    paddingVertical: space.sm,
    backgroundColor: theme.color.fill,
  },
  label: {
    ...type.label,
    color: theme.color.text,
  },
});
