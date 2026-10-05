import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { DeckGrid } from '@/components/DeckGrid';
import { FilterButton } from '@/components/FilterButton';
import { SwipeCard } from '@/components/SwipeCard';
import { UndoButton } from '@/components/UndoButton';
import { ViewToggle, type DeckView } from '@/components/ViewToggle';
import { Button, Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useDeck, useListingCounts, usePrimeListing, type ListingCounts } from '@/data/listings';
import { usePassCount, useRecordSwipe, useStartOver, useUndoPass } from '@/data/swipes';
import { useOpenFilters } from '@/features/filters/open';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useSaveFlight, type Rect } from '@/features/saved/flight';
import { useIsWide } from '@/lib/layout';
import { useOpenStack } from '@/lib/openStack';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, motion, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

// Claimed here rather than left to the layout so the tab bar stays mounted: a
// deck that cannot draw should not also strand the user away from Saved.
export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Deck() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error, refetch } = useDeck();
  const { data: counts } = useListingCounts();
  const swipe = useRecordSwipe(userId);
  const primeListing = usePrimeListing();
  const { data: passes = 0 } = usePassCount(userId);
  const startOver = useStartOver(userId);
  const undoPass = useUndoPass(userId);
  const isWide = useIsWide();
  const styles = useThemedStyles(deckStyles);
  const open = useOpenStack();
  const { filters, clear } = useFilters('deck');
  const openFilters = useOpenFilters();
  const count = activeCount(filters);

  const [view, setView] = useState<DeckView>(isWide ? 'grid' : 'cards');
  const [lastPass, setLastPass] = useState<DeckCard | null>(null);
  // The card an undo just put back, so it can come in by the edge it left.
  const [returning, setReturning] = useState<string | null>(null);

  // Where the card is on screen, which is the stage it fills. Measured here
  // rather than in the card: the card is mid-gesture and about to unmount, and
  // this frame is the one thing on the deck that holds still.
  const { launch } = useSaveFlight();
  const stage = useRef<View>(null);
  const stageRect = useRef<Rect | null>(null);

  const measureStage = useCallback(() => {
    stage.current?.measureInWindow((x, y, width, height) => {
      stageRect.current = { x, y, width, height };
    });
  }, []);

  // One step back, and only for a pass. A save is recoverable from the Saved
  // tab, so a right swipe retires the offer instead of queueing behind it.
  const judge = (card: DeckCard, direction: SwipeDirection, from?: Rect) => {
    // A save flies from wherever it was judged, and only the view that judged
    // it knows where that was: the card stage here, the tile in the grid.
    if (direction === 'right' && from) {
      launch({ from, photo: card.photos[0]?.url });
    }

    swipe.mutate({ listingId: card.id, direction });
    setLastPass(direction === 'left' ? card : null);
    setReturning(null);
  };

  const judgeCard = (card: DeckCard, direction: SwipeDirection, releaseX: number) => {
    const from = stageRect.current;
    judge(card, direction, from ? { ...from, x: from.x + releaseX } : undefined);
  };

  const undo = lastPass
    ? () => {
        undoPass.mutate(lastPass);
        setReturning(lastPass.id);
        setLastPass(null);
      }
    : undefined;

  const actions = (
    <View style={styles.actions}>
      <UndoButton onPress={undo} />
      <FilterButton count={count} onPress={() => openFilters('deck')} />
      <ViewToggle value={view} onChange={setView} />
    </View>
  );

  if (isPending) {
    return (
      <Screen wordmark verified inTabs>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen wordmark verified action={actions} inTabs>
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="outline" onPress={() => refetch()} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen wordmark verified action={actions} inTabs>
        <Centered>
          <Heading>
            {count ? 'Nothing matches' : passes ? "That's everything" : 'Nothing left to swipe'}
          </Heading>
          <Message
            text={
              count
                ? 'Your filters are narrower than the deck.'
                : passes
                  ? `Start over to see the ${passes} you passed on again. Saved watches stay saved.`
                  : 'Check back once more dealers are approved.'
            }
          />
          {count ? (
            <Button label="Clear filters" variant="outline" onPress={clear} />
          ) : passes ? (
            <Button
              label="Start over"
              variant="outline"
              loading={startOver.isPending}
              onPress={() => startOver.mutate()}
            />
          ) : (
            <Button label="Refresh" variant="outline" onPress={() => refetch()} />
          )}
        </Centered>
      </Screen>
    );
  }

  const remaining = tally(counts, count > 0);

  if (view === 'grid') {
    return (
      <Screen wordmark verified subtitle={remaining} action={actions} width="grid" inTabs>
        <Animated.View key="grid" entering={FadeIn.duration(motion.base)} style={styles.view}>
          <DeckGrid
            cards={cards}
            onOpen={(card) => {
              primeListing(card);
              open('listing/[listingId]', { listingId: card.id }, `/listing/${card.id}`);
            }}
          />
        </Animated.View>
      </Screen>
    );
  }

  // Render a few cards deep so the next one shows under the top card.
  const visible = cards.slice(0, 3).reverse();

  return (
    <Screen wordmark verified subtitle={remaining} action={actions} width="card" inTabs>
      {/* The two views trade places rather than cutting. Entering only: the
          old view is gone the frame the state changes, so there is nothing to
          fade out, and the new one arrives over the page rather than over a
          corpse of the last one. */}
      <Animated.View key="cards" entering={FadeIn.duration(motion.base)} style={styles.view}>
        <View ref={stage} onLayout={measureStage} style={styles.stage}>
          {visible.map((card, index) => (
            <SwipeCard
              key={card.id}
              card={card}
              isTop={index === visible.length - 1}
              returning={card.id === returning}
              nextPhoto={index === visible.length - 1 ? cards[1]?.photos[0]?.url : undefined}
              onSwipe={(direction, releaseX) => judgeCard(card, direction, releaseX)}
              onExpandPhoto={(photoIndex) => {
                primeListing(card);
                open(
                  'photos/[listingId]',
                  { listingId: card.id, index: String(photoIndex) },
                  `/photos/${card.id}?index=${photoIndex}`
                );
              }}
            />
          ))}
        </View>
      </Animated.View>
    </Screen>
  );
}

/**
 * The line under the wordmark: how much of the marketplace you are looking at.
 *
 * Filtered, it is both numbers — "12 of 148 watches available" — because a
 * small number on its own reads as an empty marketplace rather than a narrow
 * filter. Unfiltered, before a swipe, the two counts are the same, so the
 * line is the catalogue alone. A swipe drops the first number in the same
 * moment the card leaves, and the line becomes "147 of 148". The brass count
 * on the Filters button beside it says how many choices made a filtered
 * first number small; naming the filters here as well wrapped to two lines
 * for a fact already on screen.
 *
 * Nothing until the count lands. The old line counted the deck in hand, which
 * capped at `DECK_LIMIT` and said "20+" — a number that was never the answer
 * to either question.
 */
function tally(counts: ListingCounts | undefined, filtered: boolean) {
  if (!counts) return undefined;

  const noun = counts.total === 1 ? 'watch' : 'watches';
  if (!filtered && counts.matched === counts.total) {
    return `${counts.total} ${noun} available`;
  }
  return `${counts.matched} of ${counts.total} ${noun} available`;
}

const deckStyles = (_theme: Theme) => ({
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  view: {
    flex: 1,
  },
  stage: {
    flex: 1,
    marginHorizontal: inset.screen,
    marginBottom: inset.screen,
  },
});
