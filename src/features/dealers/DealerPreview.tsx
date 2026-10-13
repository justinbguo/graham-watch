import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { DEALER_PREVIEW, useDealerPreview } from '@/data/dealers';
import { usePrimeListing } from '@/data/listings';
import { formatTitle } from '@/lib/format';
import { useOpenStack } from '@/lib/openStack';
import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Three of the shop's other watches, and the way to the rest.
 *
 * A buyer deciding whether to write to a stranger wants to know what else
 * they sell. The photographs answer that faster than the count above them.
 * **Inventory** names the strip. **See more**, with an arrow, opens the
 * shop's own page. The word is the header and the arrow is the control,
 * so the photographs have a name without the whole row becoming a button.
 *
 * The watch being read is left out: it is already on the card.
 */
export function DealerPreview({ dealerId, except }: { dealerId: string; except?: string }) {
  const styles = useThemedStyles(previewStyles);
  const theme = useTheme();
  const { data = [] } = useDealerPreview(dealerId);
  const open = useOpenStack();
  const primeListing = usePrimeListing();

  const cards = data.filter((card) => card.id !== except).slice(0, DEALER_PREVIEW);
  if (cards.length === 0) return null;

  return (
    <View style={styles.preview}>
      <View style={styles.heading}>
        <Text style={styles.inventory}>Inventory</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See more from this shop"
          hitSlop={space.sm}
          onPress={() => open('dealer/[dealerId]', { dealerId }, `/dealer/${dealerId}`)}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
          <Text style={styles.moreLabel}>See more</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={size.iconSmall}
            color={theme.color.text}
          />
        </Pressable>
      </View>

      <View style={styles.strip}>
        {cards.map((card) => {
          const photo = card.photos[0]?.url;
          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={formatTitle(card)}
              onPress={() => {
                primeListing(card);
                open('listing/[listingId]', { listingId: card.id }, `/listing/${card.id}`);
              }}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              {/* `contain`, as in a list row: a tile this small is for
                  recognising the case shape, and a crop magnifies the dial
                  past it. */}
              {photo ? (
                <Image source={{ uri: photo }} style={styles.photo} contentFit="contain" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const previewStyles = (theme: Theme) => ({
  preview: {
    gap: space.xs,
  },
  heading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  inventory: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
  },
  // Padding rather than a `HIT_TARGET` height: the hit slop reaches the
  // target without a band of empty card above the photographs.
  more: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingVertical: space.xs,
  },
  moreLabel: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  strip: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  // Equal tiles at the list row's 5/7, so a watch here is the same shape as
  // the same watch on the wishlist or in search.
  tile: {
    flex: 1,
    aspectRatio: 5 / 7,
    borderRadius: radius.sm,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.surfaceSunken,
  },
  photo: {
    width: '100%' as const,
    height: '100%' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
