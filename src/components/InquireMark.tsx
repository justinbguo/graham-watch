import { Pressable } from 'react-native-gesture-handler';

import { HIT_TARGET, radius, size } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import type { Theme } from '@/lib/theme';

/**
 * The mark on a saved watch nobody has written about yet. A still dot, smaller
 * than a tap, sitting on the photograph's top-right corner. The slop makes up
 * the rest of the hit target.
 */
export function InquireMark({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(markStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(HIT_TARGET - size.unread) / 2}
      onPress={onPress}
      style={styles.dot}
    />
  );
}

const markStyles = (theme: Theme) => ({
  // Centred on the corner, so half the dot sits on the photograph.
  dot: {
    position: 'absolute' as const,
    top: -size.unread / 2,
    right: -size.unread / 2,
    width: size.unread,
    height: size.unread,
    borderRadius: radius.full,
    backgroundColor: theme.color.notice,
    zIndex: 1,
  },
});
