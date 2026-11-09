import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fieldOutline, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * A door on sign-in. Same capsule as Follow: page fill, a `text` stroke,
 * label and icon in `text`, mark and label centred as one group. Apple's
 * native button stands in the same column and stays Apple's own.
 */
export function SignInOption({
  label,
  mark,
  disabled = false,
  onPress,
}: {
  label: string;
  mark?: ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(optionStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.door, pressed && styles.pressed, disabled && styles.disabled]}>
      <View style={styles.content}>
        {mark}
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const optionStyles = (theme: Theme) => ({
  door: {
    minHeight: size.controlMin,
    borderRadius: radius.full,
    backgroundColor: theme.color.background,
    borderWidth: fieldOutline,
    borderColor: theme.color.text,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // A capsule clips to its curve. Padding shorter than half the height lets
    // the rounded end cover the last letters, which on a phone is the right side.
    paddingHorizontal: size.controlMin / 2,
  },
  content: {
    maxWidth: '100%' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
  },
  label: {
    ...type.labelStrong,
    flexShrink: 1,
    textAlign: 'center' as const,
    color: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
});
