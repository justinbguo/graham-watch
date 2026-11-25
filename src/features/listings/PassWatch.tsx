import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { size, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** Same chrome as Follow and Message. Red stroke reads as the left swipe. */
export function PassWatch({
  loading,
  block = false,
  onPress,
}: {
  loading?: boolean;
  block?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(passStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Pass"
      accessibilityState={{ busy: loading }}
      disabled={loading}
      hitSlop={dealerSocialHitSlop()}
      onPress={onPress}
      style={({ pressed }) => [styles.button, block && styles.block, pressed && styles.pressed]}>
      {loading ? (
        <ActivityIndicator size="small" color={theme.color.danger} />
      ) : (
        <MaterialCommunityIcons
          name="close"
          size={size.icon}
          color={theme.color.danger}
          accessible={false}
        />
      )}
      <Text style={styles.label} numberOfLines={1}>Pass</Text>
    </Pressable>
  );
}

const passStyles = (theme: Theme) => {
  const base = dealerSocialButtonStyles(theme);
  return {
    ...base,
    button: {
      ...base.button,
      borderColor: theme.color.danger,
    },
    label: {
      ...type.labelStrong,
      color: theme.color.danger,
    },
  };
};
