import { Pressable, Text } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The way into a group, drawn as a person row: the same photograph and the
 * same padding, so it sits in the list instead of as a small capsule above it.
 * The words are `bodyStrong`, one step larger than a name, because this row
 * is the action and the names under it are people.
 */
export function GroupDoor({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(doorStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create a group"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar url={null} px={size.avatar} glyph="account-group-outline" />
      <Text style={styles.label}>Create a group</Text>
    </Pressable>
  );
}

const doorStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.bodyStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
});
