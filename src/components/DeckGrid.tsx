import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState, type Ref } from 'react';
import { Image } from 'expo-image';
import { FlatList, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { ListingSummary } from '@/components/ListingSummary';
import type { Rect } from '@/features/saved/flight';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { HIT_TARGET, inset, layout, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const MIN_TILE_WIDTH = 280;
const GAP = space.lg;

/**
 * The scanning half of the deck: many watches at once instead of one. A tap
 * reads rather than decides — it opens the detail screen — so each tile carries
 * the two verdicts as controls. There is no card to drag here and a mouse has
 * no thumb. On web the keyboard can triage without leaving the grid.
 */
export function DeckGrid({
  cards,
  onSwipe,
  onOpen,
}: {
  cards: DeckCard[];
  /** `from` is the tile the verdict came from, which is where a save flies out of. */
  onSwipe: (card: DeckCard, direction: SwipeDirection, from?: Rect) => void;
  onOpen: (card: DeckCard) => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const { width } = useWindowDimensions();
  // Measured when the verdict is given, not at layout: the grid scrolls, and a
  // rect captured on mount points at where the tile used to be.
  const tiles = useRef(new Map<string, View>());

  const judge = (card: DeckCard, direction: SwipeDirection) => {
    const tile = tiles.current.get(card.id);
    if (direction !== 'right' || !tile) return onSwipe(card, direction);

    tile.measureInWindow((x, y, tileWidth, height) =>
      onSwipe(card, direction, tileWidth ? { x, y, width: tileWidth, height } : undefined)
    );
  };

  // The grid is capped by its Screen column, so count columns against that
  // ceiling. Measuring the raw window would deal a tenth column into a
  // container that only has room for six.
  const available = Math.min(width, layout.grid);
  const columns = Math.max(2, Math.floor((available - GAP) / (MIN_TILE_WIDTH + GAP)));

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
        if (card) judge(card, direction);
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
          frameRef={(node) => {
            if (node) tiles.current.set(item.id, node);
            else tiles.current.delete(item.id);
          }}
          onOpen={() => {
            setSelected(index);
            onOpen(item);
          }}
          onJudge={(direction) => {
            setSelected(index);
            judge(item, direction);
          }}
        />
      )}
    />
  );
}

function Tile({
  card,
  isSelected,
  frameRef,
  onOpen,
  onJudge,
}: {
  card: DeckCard;
  isSelected: boolean;
  frameRef: Ref<View>;
  onOpen: () => void;
  onJudge: (direction: SwipeDirection) => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const theme = useTheme();
  const photo = card.photos[0]?.url;
  const name = `${card.brand} ${card.model ?? ''}`.trim();

  return (
    // collapsable={false} so the tile survives as a native view to measure.
    <View
      ref={frameRef}
      collapsable={false}
      style={[styles.tile, isSelected && styles.tileSelected]}>
      <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onOpen}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.photoEmptyLabel}>No photograph</Text>
          </View>
        )}

        <ListingSummary card={card} variant="tile" />
      </Pressable>

      {/* The two verdicts the deck's card gets from a thumb. Judging has to be
          reachable here or the grid can only read, never decide. */}
      <View style={styles.actions}>
        <Verdict
          icon="close"
          label={`Pass on ${name}`}
          color={theme.color.danger}
          onPress={() => onJudge('left')}
        />
        <View style={styles.actionsDivider} />
        <Verdict
          icon="bookmark-outline"
          label={`Save ${name}`}
          color={theme.color.save}
          onPress={() => onJudge('right')}
        />
      </View>
    </View>
  );
}

/** Half the tile's footer. Two of them, so neither is the default. */
function Verdict({
  icon,
  label,
  color,
  onPress,
}: {
  icon: 'close' | 'bookmark-outline';
  label: string;
  color: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(gridStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.verdict, pressed && styles.verdictPressed]}>
      <MaterialCommunityIcons name={icon} size={size.icon} color={color} />
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
    overflow: 'hidden' as const,
  },
  tileSelected: {
    borderColor: theme.color.brass,
  },
  actions: {
    flexDirection: 'row' as const,
    borderTopWidth: 1,
    borderColor: theme.color.border,
  },
  actionsDivider: {
    width: 1,
    backgroundColor: theme.color.border,
  },
  verdict: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: HIT_TARGET,
    paddingVertical: inset.compactY,
    borderRadius: radius.sm,
  },
  verdictPressed: {
    backgroundColor: theme.color.surfaceSunken,
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
});
