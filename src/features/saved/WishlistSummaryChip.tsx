import { Text, View } from 'react-native';

import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Wishlist header: watch count and portfolio total on one green chip. */
export function WishlistSummaryChip({
  count,
  total,
  onRequest,
}: {
  count: number;
  total: string | null;
  onRequest: number;
}) {
  const styles = useThemedStyles(chipStyles);
  const watches = `${count} ${count === 1 ? 'watch' : 'watches'}`;

  return (
    <View style={styles.chip} accessibilityRole="text">
      <Text style={styles.line} numberOfLines={1}>
        {total ? (
          <>
            <Text style={styles.strong}>{watches}</Text>
            <Text style={styles.sep}> · </Text>
            <Text style={styles.strong}>{total}</Text>
          </>
        ) : (
          <Text style={styles.strong}>{watches}</Text>
        )}
        {onRequest > 0 ? (
          <>
            <Text style={styles.sep}> · </Text>
            <Text style={styles.muted}>
              {onRequest} on request
            </Text>
          </>
        ) : null}
      </Text>
    </View>
  );
}

const chipStyles = (theme: Theme) => ({
  chip: {
    backgroundColor: theme.color.money,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    maxWidth: '100%' as const,
    flexShrink: 0,
    alignSelf: 'center' as const,
    justifyContent: 'center' as const,
  },
  line: {
    ...type.labelStrong,
    color: theme.color.onMoney,
  },
  strong: {
    ...type.labelStrong,
    color: theme.color.onMoney,
  },
  sep: {
    ...type.labelStrong,
    color: theme.color.onMoney,
    opacity: 0.72,
  },
  muted: {
    ...type.caption,
    color: theme.color.onMoney,
    opacity: 0.88,
  },
});
