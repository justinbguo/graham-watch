import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Always-open filter block. Accordion collapse stays available later if needed. */
export function FilterGroup({
  title,
  selectedCount,
  children,
}: {
  title: string;
  selectedCount?: number;
  children: ReactNode;
}) {
  const styles = useThemedStyles(groupStyles);

  return (
    <View style={styles.group}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {selectedCount ? <Text style={styles.badge}>{selectedCount}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const groupStyles = (theme: Theme) => ({
  group: {
    gap: stack.tight,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  title: {
    ...type.eyebrow,
    color: theme.color.textMuted,
    textTransform: 'uppercase' as const,
  },
  badge: {
    ...type.caption,
    color: theme.color.brass,
  },
  body: {
    borderRadius: radius.lg,
    backgroundColor: theme.color.surface,
    overflow: 'hidden' as const,
    paddingHorizontal: space.md,
  },
});
