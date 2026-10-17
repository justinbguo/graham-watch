import { ActivityIndicator, Pressable, Text } from 'react-native';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** Same capsule as Follow and Message on a shop. */
export function PaywallButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  solid = false,
  block = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Filled `text` ink, like Follow. */
  solid?: boolean;
  block?: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(paywallButtonStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      hitSlop={dealerSocialHitSlop()}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        block && styles.block,
        block && styles.fullWidth,
        solid && styles.solid,
        (pressed || busy) && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={solid ? theme.color.background : theme.color.text} />
      ) : (
        <Text style={[styles.label, solid && styles.solidLabel]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const paywallButtonStyles = (theme: Theme) => ({
  ...dealerSocialButtonStyles(theme),
  fullWidth: {
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
  disabled: {
    opacity: 0.4,
  },
});
