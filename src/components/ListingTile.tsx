import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ListingSummary } from '@/components/ListingSummary';
import { formatTitle } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { radius, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * One watch in the wide home grid: photograph on top, name and price under it.
 * A row wastes a desktop window on empty type beside a small photo; a tile
 * spends the width on more watches. Tap opens the listing — the tile is for
 * recognising, not deciding.
 */
export function ListingTile({
  card,
  onPress,
  selected = false,
}: {
  card: DeckCard;
  onPress?: () => void;
  /** The grid's keyboard cursor on the web. */
  selected?: boolean;
}) {
  const styles = useThemedStyles(tileStyles);
  const photo = card.photos[0]?.url;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={formatTitle(card)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} contentFit="contain" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={styles.photoEmptyLabel}>No photograph</Text>
        </View>
      )}
      <ListingSummary card={card} stacked />
    </Pressable>
  );
}

const tileStyles = (theme: Theme) => ({
  tile: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    // Transparent rather than absent: a border that appears only once selected
    // would move the tile by a pixel as the cursor lands on it.
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: theme.color.brass,
  },
  photo: {
    width: '100%' as const,
    aspectRatio: 5 / 7,
    backgroundColor: theme.color.surfaceSunken,
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  photoEmptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  pressed: {
    opacity: 0.72,
  },
});
