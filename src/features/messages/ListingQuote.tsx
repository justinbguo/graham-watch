import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { MessageListing } from '@/data/messages';
import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The watch a message is answering, drawn above the words. Same frame as a
 * wishlist row: 5/7 and `contain`, so the case stays recognisable at this size.
 */
export function ListingQuote({ listing, onPress }: { listing: MessageListing; onPress: () => void }) {
  const styles = useThemedStyles(quoteStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${listing.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.quote, pressed && styles.pressed]}>
      {listing.photoUrl ? (
        <Image
          source={{ uri: listing.photoUrl }}
          style={styles.photo}
          contentFit="contain"
          accessible={false}
        />
      ) : (
        <View style={[styles.photo, styles.empty]}>
          <Text style={styles.emptyLabel}>No photograph</Text>
        </View>
      )}
      <Text style={styles.title} numberOfLines={2}>
        {listing.title}
      </Text>
    </Pressable>
  );
}

const quoteStyles = (theme: Theme) => ({
  quote: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    maxWidth: '82%' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  photo: {
    width: size.gridScan,
    aspectRatio: 5 / 7,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.surfaceSunken,
  },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.xs,
  },
  emptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  title: {
    ...type.labelStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
});
