import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { useListExposures } from '@/data/listingEvents';
import { formatTitle } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** Three across, like the explore wall this copies. */
const COLUMNS = 3;
/** One large photograph and five small ones. The next block mirrors it. */
const MOSAIC = 6;
const GAP = space.xs;

type Mosaic = {
  kind: 'mosaic';
  id: string;
  flip: boolean;
  big: DeckCard;
  side: [DeckCard, DeckCard];
  foot: [DeckCard, DeckCard, DeckCard];
};

type Strip = {
  kind: 'strip';
  id: string;
  cards: DeckCard[];
};

type Block = Mosaic | Strip;

/**
 * Search is a wall of photographs, not a list of rows. Each block is one
 * large square and five small ones; the large one swaps sides each block,
 * which is the explore rhythm. A leftover that cannot fill a block stays
 * small, in rows of three.
 */
export function ExploreGrid({
  cards,
  onOpen,
  onEndReached,
}: {
  cards: DeckCard[];
  onOpen: (card: DeckCard) => void;
  onEndReached?: () => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const wall = useMemo(() => blocks(cards), [cards]);
  const exposures = useListExposures('search', wall, { cardsOf: blockCards });

  return (
    <View
      style={styles.frame}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((current) => (current === next ? current : next));
      }}>
      {cell > 0 ? (
        <FlatList
          style={styles.frame}
          data={wall}
          keyExtractor={(block) => block.id}
          {...exposures}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          renderItem={({ item }) =>
            item.kind === 'mosaic' ? (
              <MosaicBlock block={item} cell={cell} onOpen={onOpen} />
            ) : (
              <View style={styles.row}>
                {item.cards.map((card) => (
                  <Tile key={card.id} card={card} span={cell} onOpen={() => onOpen(card)} />
                ))}
              </View>
            )
          }
        />
      ) : null}
    </View>
  );
}

function MosaicBlock({
  block,
  cell,
  onOpen,
}: {
  block: Mosaic;
  cell: number;
  onOpen: (card: DeckCard) => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const span = cell * 2 + GAP;
  const hero = <Tile card={block.big} span={span} onOpen={() => onOpen(block.big)} />;
  const side = (
    <View style={styles.side}>
      {block.side.map((card) => (
        <Tile key={card.id} card={card} span={cell} onOpen={() => onOpen(card)} />
      ))}
    </View>
  );

  return (
    <View style={styles.mosaic}>
      <View style={styles.row}>
        {block.flip ? side : hero}
        {block.flip ? hero : side}
      </View>
      <View style={styles.row}>
        {block.foot.map((card) => (
          <Tile key={card.id} card={card} span={cell} onOpen={() => onOpen(card)} />
        ))}
      </View>
    </View>
  );
}

function Tile({
  card,
  span,
  onOpen,
}: {
  card: DeckCard;
  span: number;
  onOpen: () => void;
}) {
  const styles = useThemedStyles(gridStyles);
  const photo = card.photos[0]?.url;
  const frame = { width: span, height: span };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={formatTitle(card)}
      onPress={onOpen}
      style={({ pressed }) => [frame, pressed && styles.pressed]}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={[frame, styles.photo]}
          contentFit="cover"
          accessible={false}
          recyclingKey={card.id}
        />
      ) : (
        <View style={[frame, styles.photo]} />
      )}
    </Pressable>
  );
}

function blocks(cards: DeckCard[]): Block[] {
  const out: Block[] = [];
  let index = 0;
  let flip = false;

  while (index + MOSAIC <= cards.length) {
    const [big, a, b, c, d, e] = cards.slice(index, index + MOSAIC);
    out.push({ kind: 'mosaic', id: big.id, flip, big, side: [a, b], foot: [c, d, e] });
    flip = !flip;
    index += MOSAIC;
  }

  while (index < cards.length) {
    const row = cards.slice(index, index + COLUMNS);
    out.push({ kind: 'strip', id: row[0].id, cards: row });
    index += COLUMNS;
  }

  return out;
}

function blockCards(block: Block): DeckCard[] {
  return block.kind === 'mosaic' ? [block.big, ...block.side, ...block.foot] : block.cards;
}

const gridStyles = (theme: Theme) => ({
  frame: {
    flex: 1,
  },
  list: {
    gap: GAP,
    paddingBottom: space.xxxl,
  },
  mosaic: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row' as const,
    gap: GAP,
  },
  side: {
    gap: GAP,
  },
  photo: {
    backgroundColor: theme.color.surface,
  },
  pressed: {
    opacity: 0.72,
  },
});
