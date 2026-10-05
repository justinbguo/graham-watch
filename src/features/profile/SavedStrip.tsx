import { Image } from 'expo-image';
import { FlatList, Pressable, Text, View } from 'react-native';

import { usePrimeListing, useSaved } from '@/data/listings';
import { formatPrice, formatTitle } from '@/lib/format';
import { useOpenStack } from '@/lib/openStack';
import type { DeckCard } from '@/lib/models';
import { radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

/**
 * Saved watches in a row. The profile page is already a vertical list for the
 * shop, so this one scrolls sideways. A list that can run past the screen
 * stays virtualized.
 */
export function SavedStrip() {
  const { userId } = useSession();
  const { data: saved = [] } = useSaved(userId);
  const primeListing = usePrimeListing();
  const open = useOpenStack();
  const styles = useThemedStyles(stripStyles);

  // No eyebrow over an empty strip: a heading is a promise that something is
  // under it.
  if (saved.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Saved watches</Text>
      <FlatList
        horizontal
        data={saved}
        keyExtractor={(card) => card.id}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={styles.list}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => (
          <Watch
            card={item}
            onPress={() => {
              primeListing(item);
              open('listing/[listingId]', { listingId: item.id }, `/listing/${item.id}`);
            }}
          />
        )}
      />
    </View>
  );
}

function Watch({ card, onPress }: { card: DeckCard; onPress: () => void }) {
  const styles = useThemedStyles(stripStyles);
  const photo = card.photos[0]?.url;
  const title = formatTitle(card);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.watch}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} contentFit="contain" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={styles.empty}>No photograph</Text>
        </View>
      )}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={card.sold_at ? styles.sold : styles.price}>{card.sold_at ? 'Sold' : formatPrice(card)}</Text>
    </Pressable>
  );
}

const stripStyles = (theme: Theme) => ({
  section: {
    gap: stack.related,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    gap: space.md,
  },
  watch: {
    width: size.gridPhoto,
    gap: space.xs,
  },
  // The same frame as a watch in a list, whole photograph and all.
  photo: {
    width: size.gridPhoto,
    aspectRatio: 5 / 7,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  empty: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  title: {
    ...type.label,
    color: theme.color.text,
    height: type.label.lineHeight * 2,
  },
  price: {
    ...type.caption,
    color: theme.color.text,
  },
  sold: {
    ...type.caption,
    color: theme.color.textFaint,
  },
});
