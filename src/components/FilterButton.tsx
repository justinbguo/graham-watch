import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text } from 'react-native';

import { HIT_TARGET, inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * A funnel with a count on it. The count is the whole point: without it a user
 * who filtered on another screen has no way to tell why the deck looks short.
 */
export function FilterButton({ count, onPress }: { count: number; onPress: () => void }) {
  const styles = useThemedStyles(buttonStyles);
  const theme = useTheme();
  const isActive = count > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Filters, ${count} active` : 'Filters'}
      onPress={onPress}
      style={({ pressed }) => [styles.button, isActive && styles.active, pressed && styles.pressed]}>
      <MaterialCommunityIcons
        name="filter-variant"
        size={size.tabIcon}
        color={isActive ? theme.color.onAccent : theme.color.text}
      />
      {isActive ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

const buttonStyles = (theme: Theme) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: inset.chipX,
    paddingVertical: inset.chipY,
    minHeight: HIT_TARGET,
    borderRadius: radius.pill,
    backgroundColor: theme.color.surfaceSunken,
  },
  active: {
    backgroundColor: theme.color.accent,
  },
  pressed: {
    opacity: 0.72,
  },
  count: {
    ...type.control,
    color: theme.color.onAccent,
  },
});
