import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { DeckGrid } from '@/components/DeckGrid';
import { FilterButton } from '@/components/FilterButton';
import { SwipeCard } from '@/components/SwipeCard';
import { UndoButton } from '@/components/UndoButton';
import { ViewToggle, type DeckView } from '@/components/ViewToggle';
import { Button, Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useDeck, usePrimeListing } from '@/data/listings';
import { usePassCount, useRecordSwipe, useStartOver, useUndoPass } from '@/data/swipes';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useSaveFlight, type Rect } from '@/features/saved/flight';
import { useIsWide } from '@/lib/layout';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

// Claimed here rather than left to the layout so the tab bar stays mounted: a
// deck that cannot draw should not also strand the user away from Saved.
export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Deck() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error, refetch } = useDeck();
  const swipe = useRecordSwipe(userId);
  const primeListing = usePrimeListing();
  const { data: passes = 0 } = usePassCount(userId);
  const startOver = useStartOver(userId);
  const undoPass = useUndoPass(userId);
  const isWide = useIsWide();
  const styles = useThemedStyles(deckStyles);
  const router = useRouter();
  const { filters, clear } = useFilters('deck');
  const count = activeCount(filters);

  const [view, setView] = useState<DeckView>(isWide ? 'grid' : 'cards');
  const [lastPass, setLastPass] = useState<DeckCard | null>(null);

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
  };

  const judgeCard = (card: DeckCard, direction: SwipeDirection, releaseX: number) => {
    const from = stageRect.current;
    judge(card, direction, from ? { ...from, x: from.x + releaseX } : undefined);
  };

  const undo = lastPass
    ? () => {
        undoPass.mutate(lastPass);
        setLastPass(null);
      }
    : undefined;

  const actions = (
    <View style={styles.actions}>
      <UndoButton onPress={undo} />
      <FilterButton count={count} onPress={() => router.push('/filters/deck')} />
      <ViewToggle value={view} onChange={setView} />
    </View>
  );

  if (isPending) {
    return (
      <Screen title="Graham" inTabs>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Graham" action={actions} inTabs>
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="outline" onPress={() => refetch()} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen title="Graham" action={actions} inTabs>
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

  if (view === 'grid') {
    return (
      <Screen title="Graham" action={actions} width="grid" inTabs>
        <DeckGrid
          cards={cards}
          onSwipe={judge}
          onOpen={(card) => {
            primeListing(card);
            router.push(`/listing/${card.id}`);
          }}
        />
      </Screen>
    );
  }

  // Render a few cards deep so the next one shows under the top card.
  const visible = cards.slice(0, 3).reverse();

  return (
    <Screen title="Graham" action={actions} width="card" inTabs>
      <View ref={stage} onLayout={measureStage} style={styles.stage}>
        {visible.map((card, index) => (
          <SwipeCard
            key={card.id}
            card={card}
            isTop={index === visible.length - 1}
            onSwipe={(direction, releaseX) => judgeCard(card, direction, releaseX)}
            onAsk={() => router.push(`/inquiry/${card.id}`)}
            onExpandPhoto={(index) => {
              primeListing(card);
              router.push(`/photos/${card.id}?index=${index}`);
            }}
          />
        ))}
      </View>
    </Screen>
  );
}

const deckStyles = (_theme: Theme) => ({
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  stage: {
    flex: 1,
    marginHorizontal: inset.screen,
    marginBottom: inset.screen,
  },
});
