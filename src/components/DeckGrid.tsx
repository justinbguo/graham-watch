import { useEffect, useState } from 'react';
import { FlatList, Platform, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { ListingTile } from '@/components/ListingTile';
import { useIsWide } from '@/lib/layout';
import type { DeckCard } from '@/lib/models';
import { layout, space } from '@/lib/theme';
import { isTypingTarget } from '@/lib/webKeys';
import { useThemedStyles } from '@/providers/theme';

const GAP = space.sm;
const COLUMNS = layout.gridColumns;

/**
 * The scanning half of the deck. On a wide window it is a tile grid —
 * photograph above the copy, `layout.gridColumns` across — so the page fills
 * with watches. On a phone it stays one row each. A tap opens the listing.
 *
 * On web the arrows move the selection (left/right within a row, up/down by a
 * row). Enter opens. Pass and save live on the listing, and on the card view's
 * left/right keys.
 */
export function DeckGrid({
  cards,
  onOpen,
  active = true,
}: {
  cards: DeckCard[];
  onOpen: (card: DeckCard) => void;
  /** False while a sheet covers the deck, so keys do not steer underneath it. */
  active?: boolean;
}) {
  const wide = useIsWide();
  const styles = useThemedStyles(gridStyles);
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(cards.length - 1, 0));
  const columns = wide ? COLUMNS : 1;

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const card = cards[selectedIndex];
      const move = (delta: number) => {
        event.preventDefault();
        setSelected((current) => Math.max(0, Math.min(cards.length - 1, current + delta)));
      };

      switch (event.key) {
        case 'Enter': {
          if (!card) return;
          event.preventDefault();
          onOpen(card);
          return;
        }
        case 'ArrowRight':
          return move(1);
        case 'ArrowLeft':
          return move(-1);
        case 'ArrowDown':
          return move(columns);
        case 'ArrowUp':
          return move(-columns);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, cards, columns, selectedIndex, onOpen]);

  if (!wide) {
    return (
      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => (
          <ListingRow
            card={item}
            scan
            selected={Platform.OS === 'web' && index === selectedIndex}
            onPress={() => {
              setSelected(index);
              onOpen(item);
            }}
          />
        )}
      />
    );
  }

  return (
    <FlatList
      data={cards}
      keyExtractor={(card) => card.id}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      renderItem={({ item, index }) => (
        <View style={styles.cell}>
          <ListingTile
            card={item}
            selected={Platform.OS === 'web' && index === selectedIndex}
            onPress={() => {
              setSelected(index);
              onOpen(item);
            }}
          />
        </View>
      )}
    />
  );
}

const gridStyles = () => ({
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  cell: {
    flex: 1,
    // FlatList still lays out a short last row. Cap each cell so four equal
    // tiles stay the same width when the row is incomplete.
    maxWidth: `${100 / COLUMNS}%` as const,
  },
});
