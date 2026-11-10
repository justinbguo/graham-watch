import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';

import { dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { listingSourceUrl } from '@/lib/listingSource';
import { openExternal } from '@/lib/openExternal';
import { controlText, fieldOutline, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export function DealerSiteButton({
  url,
  grouped = false,
}: {
  url: string | null | undefined;
  /** Full width under Pass and Add to wishlist. Same capsule, stretched. */
  grouped?: boolean;
}) {
  const href = listingSourceUrl(url);
  const theme = useTheme();
  const styles = useThemedStyles(buttonStyles);
  if (!href) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="View on dealer site"
      hitSlop={dealerSocialHitSlop(size.follow)}
      onPress={() => openExternal(href)}
      style={({ pressed }) => [styles.link, grouped && styles.stretch, pressed && styles.pressed]}>
      <MaterialCommunityIcons
        name="link-variant"
        size={size.iconSmall}
        color={theme.color.text}
        accessible={false}
      />
      <Text style={styles.linkLabel} numberOfLines={1}>
        View on dealer site
      </Text>
    </Pressable>
  );
}

const buttonStyles = (theme: Theme) => ({
  stretch: {
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
  // Stroke and no fill: this leaves the app, so it stays quieter than a verdict.
  // Horizontal padding is half the height, or the capsule curve covers the label.
  link: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    height: size.follow,
    paddingHorizontal: size.follow / 2,
    maxWidth: '100%' as const,
    borderRadius: radius.full,
    borderWidth: fieldOutline,
    borderColor: theme.color.text,
    backgroundColor: 'transparent' as const,
  },
  linkLabel: {
    ...controlText.label,
    flexShrink: 1,
    minWidth: 0,
    color: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
});
