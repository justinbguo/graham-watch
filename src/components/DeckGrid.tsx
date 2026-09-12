import { useEffect, useState } from 'react';
import { FlatList, Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const MIN_TILE_WIDTH = 280;
const GAP = space.lg;

/**
 * The desktop half of the deck. Swiping is a thumb gesture, so on a wide screen
 * the same listings are browsed as a grid and acted on with a click or the
 * keyboard. Both surfaces call the same `onSwipe`, so the data layer is shared.
 */
export function DeckGrid({
  cards,
  onSwipe,
}: {
  cards: DeckCard[];
  onSwipe: (card: DeckCard, direction: SwipeDirection) => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const { width } = useWindowDimensions();
  const columns = Math.max(2, Math.floor((width - GAP) / (MIN_TILE_WIDTH + GAP)));

  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(cards.length - 1, 0));

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const move = (delta: number) => {
        event.preventDefault();
        setSelected((current) => Math.max(0, Math.min(cards.length - 1, current + delta)));
      };
      const act = (direction: SwipeDirection) => {
        const card = cards[selectedIndex];
        if (card) onSwipe(card, direction);
      };

      switch (event.key) {
        case 'ArrowRight':
          return move(1);
        case 'ArrowLeft':
          return move(-1);
        case 'ArrowDown':
          return move(columns);
        case 'ArrowUp':
          return move(-columns);
        case 's':
          return act('right');
        case 'x':
          return act('left');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cards, columns, selectedIndex, onSwipe]);

  return (
    <>
      <FlatList
        // FlatList cannot change numColumns in place, so remount on resize.
        key={columns}
        data={cards}
        keyExtractor={(card) => card.id}
        numColumns={columns}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => (
          <Tile
            card={item}
            isSelected={index === selectedIndex}
            onSelect={() => setSelected(index)}
            onSave={() => onSwipe(item, 'right')}
            onPass={() => onSwipe(item, 'left')}
          />
        )}
      />
      <Text style={styles.hint}>Arrows to move · S to save · X to pass</Text>
    </>
  );
}

function Tile({
  card,
  isSelected,
  onSelect,
  onSave,
  onPass,
}: {
  card: DeckCard;
  isSelected: boolean;
  onSelect: () => void;
  onSave: () => void;
  onPass: () => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const photo = card.photos[0]?.url;

  return (
    <Pressable style={[styles.tile, isSelected && styles.tileSelected]} onPress={onSelect}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={styles.photoEmptyLabel}>No photograph</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.brand} numberOfLines={1}>
          {card.brand}
        </Text>
        <Text style={styles.model} numberOfLines={1}>
          {card.model ?? 'Unknown model'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatSpecs(card)}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(card)}</Text>
          {card.dealer ? (
            <Text style={styles.dealer} numberOfLines={1}>
              {card.dealer.name}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onPass} style={styles.action}>
          <Text style={[styles.actionLabel, styles.passLabel]}>Pass</Text>
        </Pressable>
        <View style={styles.actionDivider} />
        <Pressable accessibilityRole="button" onPress={onSave} style={styles.action}>
          <Text style={[styles.actionLabel, styles.saveLabel]}>Save</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const gridStyles = (theme: Theme) => ({
  content: {
    padding: GAP,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  hint: {
    ...type.caption,
    color: theme.color.textFaint,
    textAlign: 'center' as const,
    paddingBottom: space.lg,
  },
  tile: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden' as const,
  },
  tileSelected: {
    borderColor: theme.color.brass,
  },
  photo: {
    width: '100%' as const,
    aspectRatio: 4 / 5,
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
  info: {
    padding: space.lg,
    gap: space.xs / 2,
  },
  brand: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  model: {
    ...type.title,
    fontSize: 18,
    lineHeight: 24,
    color: theme.color.text,
    paddingTop: space.xs,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    paddingTop: space.sm,
  },
  price: {
    ...type.price,
    fontSize: 16,
    color: theme.color.text,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  action: {
    flex: 1,
    paddingVertical: space.md,
    alignItems: 'center' as const,
  },
  actionDivider: {
    width: 1,
    backgroundColor: theme.color.border,
  },
  actionLabel: {
    ...type.label,
    fontSize: 13,
  },
  saveLabel: {
    color: theme.color.save,
  },
  passLabel: {
    color: theme.color.danger,
  },
});
