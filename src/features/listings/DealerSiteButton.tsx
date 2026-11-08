import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Platform, Pressable, Text } from 'react-native';

import { Button } from '@/components/ui';
import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { listingSourceUrl } from '@/lib/listingSource';
import { size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export function openListingSource(url: string): void {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(url);
}

export function DealerSiteButton({
  url,
  grouped = false,
}: {
  url: string | null | undefined;
  /** Full width under Pass and Add to wishlist, in their chrome. */
  grouped?: boolean;
}) {
  const href = listingSourceUrl(url);
  const theme = useTheme();
  const styles = useThemedStyles(groupedStyles);
  if (!href) return null;
  if (!grouped) {
    return (
      <Button label="View on dealer site" variant="solid" onPress={() => openListingSource(href)} />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View on dealer site"
      hitSlop={dealerSocialHitSlop()}
      onPress={() => openListingSource(href)}
      style={({ pressed }) => [styles.button, styles.stretch, pressed && styles.pressed]}>
      <MaterialCommunityIcons
        name="open-in-new"
        size={size.dealerSocialMark}
        color={theme.color.text}
        accessible={false}
      />
      <Text style={styles.label} numberOfLines={1}>
        View on dealer site
      </Text>
    </Pressable>
  );
}

const groupedStyles = (theme: Theme) => ({
  ...dealerSocialButtonStyles(theme),
  stretch: {
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
});
