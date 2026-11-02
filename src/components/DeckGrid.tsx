import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ListingTile } from '@/components/ListingTile';
import { Button, Message } from '@/components/ui';
import {
  GRID_END_THRESHOLD,
  isNearListEnd,
  shouldLoadMoreGrid,
  type GridPaging,
  type ListScrollMetrics,
} from '@/data/deckPaging';
import { useIsDesktopWeb, useIsWide } from '@/lib/layout';
import type { DeckCard } from '@/lib/models';
import { layout, space, type, type Theme } from '@/lib/theme';
import { isTypingTarget } from '@/lib/webKeys';
import { useTheme, useThemedStyles } from '@/providers/theme';

const GAP = space.sm;

/**
 * The scanning half of the deck. Tiles — photograph above the copy — fill the
 * column: two across on a phone, more on a wide window. A tap opens the
 * listing.
 *
 * The cards throw a watch away, so the pile gets thin and refills itself.
 * The grid keeps every watch, so the same query turns the page here, when
 * the tail is on screen. The tile's key is the listing id. The deck cache
 * drops a watch that shows up on two pages, so it is drawn once.
 *
 * On web the arrows move the selection (left/right within a row, up/down by a
 * row). Enter opens. Pass and save live on the listing, and on the card view's
 * left/right keys.
 */
export function DeckGrid({
  cards,
  onOpen,
  active = true,
  paging,
}: {
  cards: DeckCard[];
  onOpen: (card: DeckCard) => void;
  /** False while a sheet covers the deck, so keys do not steer underneath it. */
  active?: boolean;
  paging: GridPaging;
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

  const {
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    latestPageAdded,
    onLoadMore,
    endLabel,
  } = paging;

  const metrics = useRef<ListScrollMetrics>({ contentHeight: 0, viewportHeight: 0, offsetY: 0 });
  // A resize swaps `numColumns`, which remounts the list back at the top.
  // The previous offset would look like the tail and ask for the next page.
  const columnKey = useRef(columns);
  if (columnKey.current !== columns) {
    columnKey.current = columns;
    metrics.current = { contentHeight: 0, viewportHeight: 0, offsetY: 0 };
  }

  const askForNextPage = useCallback(
    (tailVisible = false) => {
      if (!tailVisible && !isNearListEnd(metrics.current)) return;
      if (
        !shouldLoadMoreGrid({
          hasNextPage,
          isFetching,
          isFetchingNextPage,
          isFetchNextPageError,
          latestPageAdded,
        })
      ) {
        return;
      }
      // Two scroll events can land before this render sees `isFetching`.
      // `fetchNextPage` keeps the request already in flight, so the second
      // call does not append the same page twice.
      onLoadMore();
    },
    [hasNextPage, isFetching, isFetchingNextPage, isFetchNextPageError, latestPageAdded, onLoadMore],
  );

  const rememberScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      metrics.current = {
        contentHeight: contentSize.height,
        viewportHeight: layoutMeasurement.height,
        offsetY: contentOffset.y,
      };
      askForNextPage();
    },
    [askForNextPage],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metrics.current = { ...metrics.current, viewportHeight: event.nativeEvent.layout.height };
      askForNextPage();
    },
    [askForNextPage],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      metrics.current = { ...metrics.current, contentHeight: height };
      askForNextPage();
    },
    [askForNextPage],
  );

  // Arrow keys move the selection without scrolling, so the last row has to
  // ask on its own. A tap on that row does the same. The query ignores the
  // ask while a page is already on the way.
  useEffect(() => {
    if (cards.length === 0) return;
    if (selectedIndex < cards.length - columns) return;
    askForNextPage(true);
  }, [askForNextPage, cards.length, columns, selectedIndex]);

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
      style={styles.list}
      data={cards}
      keyExtractor={(card) => card.id}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
      // iOS calls onEndReached when the tail crosses the threshold. Web often
      // fires that once, or not at all, and keeps firing onScroll. Both share
      // isNearListEnd, so a mount-time onEndReached — reported before the list
      // has a height — cannot walk the catalogue.
      onScroll={rememberScroll}
      onScrollEndDrag={rememberScroll}
      onMomentumScrollEnd={rememberScroll}
      onEndReached={() => askForNextPage()}
      onEndReachedThreshold={GRID_END_THRESHOLD}
      scrollEventThrottle={16}
      onLayout={onLayout}
      onContentSizeChange={onContentSizeChange}
      ListFooterComponent={<GridFooter paging={paging} />}
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

function GridFooter({ paging }: { paging: GridPaging }) {
  const styles = useThemedStyles(gridStyles);
  const theme = useTheme();

  if (paging.isFetchingNextPage) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading more watches" style={styles.footer}>
        <ActivityIndicator size="small" color={theme.color.textMuted} />
      </View>
    );
  }

  if (paging.isFetchNextPageError) {
    return (
      <View style={styles.footer}>
        <Message text="Could not load more watches." tone="error" />
        <Button label="Try again" variant="ghost" onPress={paging.onLoadMore} />
      </View>
    );
  }

  if (!paging.hasNextPage) {
    return (
      <View style={styles.footer}>
        <Text style={styles.end}>{paging.endLabel ?? "That's everything"}</Text>
      </View>
    );
  }

  return null;
}

const gridStyles = (theme: Theme) => ({
  list: {
    flex: 1,
    // Web's default min-height is the content height, which turns the page
    // into the scroller and leaves this list with nothing to scroll.
    minHeight: 0,
  },
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
  footer: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    paddingTop: space.lg,
    paddingBottom: space.lg,
  },
  end: {
    ...type.caption,
    color: theme.color.textMuted,
    textAlign: 'center' as const,
  },
});
