import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** Same chrome as Follow and Message: rounded rect, `labelStrong`, social mark. */
export function AddToWishlist({
  loading,
  block = false,
  onPress,
}: {
  loading?: boolean;
  /** Half of a full-width pair beside Pass. */
  block?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(wishlistStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add to wishlist"
      accessibilityState={{ busy: loading }}
      disabled={loading}
      hitSlop={dealerSocialHitSlop()}
      onPress={onPress}
      style={({ pressed }) => [styles.button, block && styles.block, pressed && styles.pressed]}>
      {loading ? (
        <ActivityIndicator size="small" color={theme.color.text} />
      ) : (
        <MaterialCommunityIcons
          name="bookmark-outline"
          size={size.dealerSocialMark}
          color={theme.color.text}
          accessible={false}
        />
      )}
      <Text style={styles.label} numberOfLines={1}>Add to wishlist</Text>
    </Pressable>
  );
}

const wishlistStyles = (theme: Theme) => dealerSocialButtonStyles(theme);
