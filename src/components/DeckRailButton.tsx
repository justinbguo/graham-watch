import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type RailIcon = keyof typeof MaterialCommunityIcons.glyphMap;

/** Desktop Buy rail: outline glyph and label. */
export function DeckRailButton({
  label,
  icon,
  onPress,
  disabled = false,
  active = false,
  variant = 'default',
  accessibilityLabel,
}: {
  label: string;
  icon: RailIcon;
  onPress?: () => void;
  disabled?: boolean;
  active?: boolean;
  /** Filled accent pill for a primary rail action (e.g. New post). */
  variant?: 'default' | 'primary';
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(railButtonStyles);
  const theme = useTheme();
  const primary = variant === 'primary';
  const color = disabled
    ? theme.color.textFaint
    : primary
      ? theme.color.onAccent
      : active
        ? theme.color.brass
        : theme.color.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && !disabled && styles.pressed,
      ]}>
      <View style={styles.row}>
        <MaterialCommunityIcons name={icon} size={size.icon} color={color} />
        <Text
          style={[
            styles.label,
            primary && styles.labelPrimary,
            disabled && styles.labelDisabled,
            !primary && active && styles.labelActive,
          ]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const railButtonStyles = (theme: Theme) => ({
  button: {
    alignSelf: 'flex-start' as const,
    minHeight: size.desktopNavPill,
    paddingHorizontal: space.md,
    justifyContent: 'center' as const,
  },
  buttonPrimary: {
    alignSelf: 'stretch' as const,
    backgroundColor: theme.color.accent,
    borderRadius: radius.full,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  label: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  labelPrimary: {
    color: theme.color.onAccent,
  },
  labelDisabled: {
    color: theme.color.textFaint,
  },
  labelActive: {
    color: theme.color.brass,
  },
  pressed: {
    opacity: 0.72,
  },
});
