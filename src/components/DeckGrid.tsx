import { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { DeckCard, SwipeDirection } from '@/lib/database.types';
import { formatPrice, formatSpecs } from '@/lib/format';
import { theme } from '@/lib/theme';

const MIN_TILE_WIDTH = 260;
const GAP = theme.space(2);

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
      <Text style={styles.hint}>Arrow keys to move · S to save · X to pass</Text>
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
  const photo = card.photos[0]?.url;

  return (
    <Pressable style={[styles.tile, isSelected && styles.tileSelected]} onPress={onSelect}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.photoEmpty]}>
          <Text style={styles.photoEmptyLabel}>No photo</Text>
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
        <Text style={styles.price}>{formatPrice(card)}</Text>
        {card.dealer ? (
          <Text style={styles.dealer} numberOfLines={1}>
            {card.dealer.name}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onPass} style={styles.action}>
          <Text style={[styles.actionLabel, { color: theme.color.danger }]}>Pass</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onSave} style={styles.action}>
          <Text style={[styles.actionLabel, { color: theme.color.save }]}>Save</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: GAP,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  hint: {
    textAlign: 'center',
    color: theme.color.muted,
    fontSize: 13,
    paddingBottom: theme.space(1.5),
  },
  tile: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.color.border,
    overflow: 'hidden',
  },
  tileSelected: {
    borderColor: theme.color.accent,
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: theme.color.bg,
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyLabel: {
    color: theme.color.muted,
  },
  info: {
    padding: theme.space(1.5),
    gap: 2,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.color.muted,
  },
  model: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.color.text,
  },
  meta: {
    fontSize: 13,
    color: theme.color.muted,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.text,
    paddingTop: theme.space(0.5),
  },
  dealer: {
    fontSize: 13,
    color: theme.color.muted,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  action: {
    flex: 1,
    paddingVertical: theme.space(1.25),
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
