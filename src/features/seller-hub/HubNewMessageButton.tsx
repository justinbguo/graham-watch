import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text } from 'react-native';

import { dealerSocial } from '@/lib/design';
import { controlText, radius, shadow, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** White pill beside the Seller Hub message search. */
export function HubNewMessageButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(composeStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New message"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="plus" size={size.iconSmall} color={theme.color.text} />
      <Text style={styles.label}>New</Text>
    </Pressable>
  );
}

const composeStyles = (theme: Theme) => ({
  button: {
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
  label: {
    ...controlText.label,
    color: theme.color.text,
  },
  pressed: {
    opacity: 0.88,
  },
});
