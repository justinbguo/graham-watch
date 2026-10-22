import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text } from 'react-native';

import { dealerSocial } from '@/lib/design';
import { controlText, HIT_TARGET, radius, shadow, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Opens the new-message sheet. `icon` is a filled circle beside inbox search;
 * `pill` is the Seller Hub "New" capsule.
 */
export function NewMessageButton({
  onPress,
  variant = 'icon',
  compact = false,
}: {
  onPress: () => void;
  variant?: 'icon' | 'pill';
  /** Beside a compact inbox search (`dealerSocial.minHeight`). */
  compact?: boolean;
}) {
  const styles = useThemedStyles(buttonStyles);
  const theme = useTheme();

  if (variant === 'pill') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New message"
        onPress={onPress}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="plus" size={size.iconSmall} color={theme.color.text} />
        <Text style={styles.pillLabel}>New</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New message"
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        compact && styles.iconCompact,
        pressed && styles.pressed,
      ]}>
      <MaterialCommunityIcons
        name="plus"
        size={compact ? size.iconSmall : size.icon}
        color={theme.color.onAccent}
      />
    </Pressable>
  );
}

const buttonStyles = (theme: Theme) => ({
  icon: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.full,
    backgroundColor: theme.color.accent,
    flexShrink: 0,
  },
  iconCompact: {
    width: dealerSocial.minHeight,
    height: dealerSocial.minHeight,
  },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    minHeight: dealerSocial.minHeight,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    backgroundColor: theme.color.raised,
    boxShadow: shadow.card,
    flexShrink: 0,
  },
  pillLabel: {
    ...controlText.label,
    color: theme.color.text,
  },
  pressed: {
    opacity: 0.88,
  },
});
