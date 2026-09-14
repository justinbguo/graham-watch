import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable } from 'react-native';

import { HIT_TARGET, inset, radius, size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Takes back the last pass. Always on screen, faint when there is nothing to
 * take back — a control that appears and vanishes would shift the header on
 * every swipe, and the deck is the one screen that must sit still.
 */
export function UndoButton({ onPress }: { onPress?: () => void }) {
  const styles = useThemedStyles(buttonStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Undo, bring back the watch you passed on"
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <MaterialCommunityIcons
        name="undo-variant"
        size={size.icon}
        color={onPress ? theme.color.text : theme.color.textFaint}
      />
    </Pressable>
  );
}

const buttonStyles = (theme: Theme) => ({
  button: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: inset.compactX,
    paddingVertical: inset.compactY,
    minHeight: HIT_TARGET,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.72,
  },
});
