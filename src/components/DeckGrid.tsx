import { useEffect, useState } from 'react';
import { FlatList, Platform, View } from 'react-native';

import { ListingTile } from '@/components/ListingTile';
import { useIsDesktopWeb, useIsWide } from '@/lib/layout';
import type { DeckCard } from '@/lib/models';
import { layout, space } from '@/lib/theme';
import { isTypingTarget } from '@/lib/webKeys';
import { useThemedStyles } from '@/providers/theme';

const GAP = space.sm;

/**
 * The scanning half of the deck. Tiles — photograph above the copy — fill the
 * column: two across on a phone, more on a wide window. A tap opens the
 * listing.
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
  const isDesktopWeb = useIsDesktopWeb();
  const styles = useThemedStyles(gridStyles);
  const [selected, setSelected] = useState(0);
  const selectedIndex = Math.min(selected, Math.max(cards.length - 1, 0));
  const columns = wide
    ? isDesktopWeb
      ? layout.gridColumnsWeb
      : layout.gridColumns
    : layout.gridColumnsPhone;

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

  return (
    <FlatList
      key={`deck-grid-${columns}`}
      data={cards}
      keyExtractor={(card) => card.id}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
      renderItem={({ item, index }) => (
        <View style={[styles.cell, columns > 1 && { maxWidth: `${100 / columns}%` as const }]}>
          <ListingTile
            card={item}
            photoShape={isDesktopWeb ? 'swipe' : 'square'}
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
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    gap: GAP,
  },
  contentDesktop: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  row: {
    gap: GAP,
  },
  cell: {
    flex: 1,
  },
});
