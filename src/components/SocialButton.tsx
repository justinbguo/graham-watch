import { ActivityIndicator, Pressable, Text } from 'react-native';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { yellow } from '@/lib/design';
import { space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** Same capsule as Follow and Message on a shop. */
export function SocialButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  solid = false,
  block = false,
  rowItem = false,
  compact = false,
  deal = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Filled `text` ink, like Follow. */
  solid?: boolean;
  block?: boolean;
  /** Share a row with another button (`flex: 1`, no forced full width). */
  rowItem?: boolean;
  /** Shorter capsule for the composer row. */
  compact?: boolean;
  /** Graham gold fill for seller deal actions in the thread. */
  deal?: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(socialStyles);

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
        (block || rowItem) && styles.block,
        rowItem && styles.rowItem,
        block && !rowItem && styles.fullWidth,
        solid && styles.solid,
        compact && styles.compact,
        deal && styles.deal,
        (pressed || busy) && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={solid ? theme.color.background : theme.color.text} />
      ) : (
        <Text
          style={[
            styles.label,
            solid && styles.solidLabel,
            rowItem && styles.rowLabel,
            compact && styles.compactLabel,
            deal && styles.dealLabel,
          ]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const socialStyles = (theme: Theme) => ({
  ...dealerSocialButtonStyles(theme),
  fullWidth: {
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
  rowItem: {
    paddingHorizontal: space.sm,
  },
  rowLabel: {
    textAlign: 'center' as const,
  },
  compact: {
    minHeight: 32,
    paddingHorizontal: space.sm,
  },
  compactLabel: {
    fontFamily: type.caption.fontFamily,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.fontSize,
    includeFontPadding: false,
  },
  deal: {
    backgroundColor: yellow,
    borderColor: yellow,
  },
  dealLabel: {
    color: '#17140F',
  },
  disabled: {
    opacity: 0.4,
  },
});
