import { useEffect, useState } from 'react';
import { FlatList, Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const MIN_TILE_WIDTH = 280;
const GAP = space.lg;

/**
 * The scanning half of the deck: many watches at once instead of one. Acting on
 * a watch stays a swipe, so a tap opens it in card view rather than saving it
 * outright. On web the keyboard can triage without leaving the grid.
 */
export function DeckGrid({
  cards,
  onSwipe,
  onOpen,
}: {
  cards: DeckCard[];
  onSwipe: (card: DeckCard, direction: SwipeDirection) => void;
  onOpen: (card: DeckCard) => void;
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
        case 'Enter': {
          const card = cards[selectedIndex];
          return card && onOpen(card);
        }
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
  }, [cards, columns, selectedIndex, onSwipe, onOpen]);

  return (
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
          onOpen={() => {
            setSelected(index);
            onOpen(item);
          }}
        />
      )}
    />
  );
}

function Tile({
  card,
  isSelected,
  onOpen,
}: {
  card: DeckCard;
  isSelected: boolean;
  onOpen: () => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const photo = card.photos[0]?.url;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.brand} ${card.model ?? ''}`.trim()}
      style={[styles.tile, isSelected && styles.tileSelected]}
      onPress={onOpen}>
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
    padding: inset.card,
    gap: stack.tight,
  },
  brand: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  model: {
    ...type.title,
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
    color: theme.color.text,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
});
