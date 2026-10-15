import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { MessageListing } from '@/data/messages';
import { radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * The watch a message is answering: the photograph, the name under it. The
 * shop-page frame, `gridPhoto`, 5/7 and `contain`, so the case stays
 * recognisable beside the composer. It sits on the side of whoever is asking.
 */
export function ListingQuote({
  listing,
  onPress,
  mine = true,
}: {
  listing: MessageListing;
  onPress: () => void;
  mine?: boolean;
}) {
  const styles = useThemedStyles(quoteStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${listing.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.quote, mine && styles.mine, pressed && styles.pressed]}>
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
      <Text style={[styles.title, mine && styles.titleMine]} numberOfLines={2}>
        {listing.title}
      </Text>
    </Pressable>
  );
}

const quoteStyles = (theme: Theme) => ({
  quote: {
    alignSelf: 'flex-start' as const,
    alignItems: 'flex-start' as const,
    gap: stack.tight,
    maxWidth: '82%' as const,
  },
  mine: {
    alignSelf: 'flex-end' as const,
    alignItems: 'flex-end' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  photo: {
    width: size.gridPhoto,
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
    ...type.titleSmall,
    color: theme.color.text,
  },
  titleMine: {
    textAlign: 'right' as const,
  },
});
