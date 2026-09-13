import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { useIsWide } from '@/lib/layout';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

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

  // One step back, and only for a pass. A save is recoverable from the Saved
  // tab, so a right swipe retires the offer instead of queueing behind it.
  const judge = (card: DeckCard, direction: SwipeDirection) => {
    swipe.mutate({ listingId: card.id, direction });
    setLastPass(direction === 'left' ? card : null);
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
      <Screen title="Buy">
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Buy" action={actions}>
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen title="Buy" action={actions}>
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
            <Button label="Clear filters" variant="secondary" onPress={clear} />
          ) : passes ? (
            <Button
              label="Start over"
              variant="secondary"
              loading={startOver.isPending}
              onPress={() => startOver.mutate()}
            />
          ) : (
            <Button label="Refresh" variant="secondary" onPress={() => refetch()} />
          )}
        </Centered>
      </Screen>
    );
  }

  if (view === 'grid') {
    return (
      <Screen title="Buy" action={actions} width="grid">
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
    <Screen title="Buy" action={actions} width="card">
      <View style={styles.stage}>
        {visible.map((card, index) => (
          <SwipeCard
            key={card.id}
            card={card}
            isTop={index === visible.length - 1}
            onSwipe={(direction) => judge(card, direction)}
            onOpen={() => {
              primeListing(card);
              router.push(`/listing/${card.id}`);
            }}
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
