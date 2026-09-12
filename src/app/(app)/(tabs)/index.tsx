import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DeckGrid } from '@/components/DeckGrid';
import { FilterButton } from '@/components/FilterButton';
import { SwipeCard } from '@/components/SwipeCard';
import { ViewToggle, type DeckView } from '@/components/ViewToggle';
import { Button, Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useDeck } from '@/data/listings';
import { usePassCount, useRecordSwipe, useStartOver } from '@/data/swipes';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useIsWide } from '@/lib/layout';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export default function Deck() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error, refetch } = useDeck();
  const swipe = useRecordSwipe(userId);
  const { data: passes = 0 } = usePassCount(userId);
  const startOver = useStartOver(userId);
  const isWide = useIsWide();
  const styles = useThemedStyles(deckStyles);
  const router = useRouter();
  const { filters, clear } = useFilters('deck');
  const count = activeCount(filters);

  const [view, setView] = useState<DeckView>(isWide ? 'grid' : 'cards');
  const [focusId, setFocusId] = useState<string | null>(null);

  // Opening a watch from the grid puts it on top of the pile. Once it is swiped
  // away it leaves `cards` and the natural order resumes on its own.
  const ordered = useMemo(() => {
    const index = focusId ? cards.findIndex((card) => card.id === focusId) : -1;
    if (index <= 0) return cards;
    return [cards[index], ...cards.slice(0, index), ...cards.slice(index + 1)];
  }, [cards, focusId]);

  const actions = (
    <View style={styles.actions}>
      <FilterButton count={count} onPress={() => router.push('/filters/deck')} />
      <ViewToggle value={view} onChange={setView} />
    </View>
  );

  if (isPending) {
    return (
      <Screen title="Deck">
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Deck" action={actions}>
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen title="Deck" action={actions}>
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
      <Screen title="Deck" action={actions}>
        <DeckGrid
          cards={cards}
          onSwipe={(card, direction) => swipe.mutate({ listingId: card.id, direction })}
          onOpen={(card) => {
            setFocusId(card.id);
            setView('cards');
          }}
        />
      </Screen>
    );
  }

  // Render a few cards deep so the next one shows under the top card.
  const visible = ordered.slice(0, 3).reverse();

  return (
    <Screen title="Deck" action={actions}>
      <View style={styles.stage}>
        {visible.map((card, index) => (
          <SwipeCard
            key={card.id}
            card={card}
            isTop={index === visible.length - 1}
            onSwipe={(direction) => swipe.mutate({ listingId: card.id, direction })}
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
