import { useEffect, useState } from 'react';
import { FlatList, Platform } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import type { DeckCard } from '@/lib/models';
import { space } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const GAP = space.sm;
/** One watch per row, so up and down move to the next watch. */
const COLUMNS = 1;

/**
 * The scanning half of the deck: many watches at once instead of one. A tap
 * opens the listing, which is where the watch is passed or saved. There is no
 * card to drag here and a mouse has no thumb. On web the keyboard moves
 * between rows and Enter opens the selected one.
 */
export function DeckGrid({
  cards,
  onOpen,
}: {
  cards: DeckCard[];
  onOpen: (card: DeckCard) => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(cards.length - 1, 0));

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const move = (delta: number) => {
        event.preventDefault();
        setSelected((current) => Math.max(0, Math.min(cards.length - 1, current + delta)));
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
          return move(COLUMNS);
        case 'ArrowUp':
          return move(-COLUMNS);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cards, selectedIndex, onOpen]);

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

const gridStyles = () => ({
  content: {
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    gap: GAP,
  },
});
