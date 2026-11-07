import { router } from 'expo-router';
import { Platform, Pressable, Text } from 'react-native';

import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * One inbox row for every followed shop's new watches. It is not a thread.
 * Opening it is the same feed Profile used to open, and that feed marks them seen.
 *
 * On web, `router.push` is what puts `/drops` in the address and shows the feed.
 * The phone uses the stack dispatch, because a push from a tab is dropped there.
 */
export function DropsInboxEntry({ unseen }: { unseen: number }) {
  const open = useOpenStack();
  const styles = useThemedStyles(entryStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`New from dealers you follow, ${unseen}`}
      onPress={() => {
        if (Platform.OS === 'web') {
          router.push('/drops');
          return;
        }
        open('drops', undefined, '/drops');
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Text style={styles.title}>New from dealers you follow</Text>
      <Text style={styles.count}>{unseen}</Text>
    </Pressable>
  );
}

const entryStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: HIT_TARGET,
  },
  pressed: {
    opacity: 0.72,
  },
  title: {
    ...type.labelStrong,
    color: theme.color.text,
    flex: 1,
  },
  count: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
