import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DeckGrid } from '@/components/DeckGrid';
import { SwipeCard } from '@/components/SwipeCard';
import { ViewToggle, type DeckView } from '@/components/ViewToggle';
import { Button, Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useDeck } from '@/data/listings';
import { useRecordSwipe } from '@/data/swipes';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useIsWide } from '@/lib/layout';
import { inset, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export default function Deck() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error, refetch } = useDeck();
  const swipe = useRecordSwipe(userId);
  const isWide = useIsWide();
  const styles = useThemedStyles(deckStyles);
  const router = useRouter();
  const { filters, clear } = useFilters();
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

  const toggle = <ViewToggle value={view} onChange={setView} />;

  if (isPending) {
    return (
      <Screen title="Deck">
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Deck">
        <Centered>
          <Message text={error.message} tone="error" />
          <Button label="Try again" variant="secondary" onPress={() => refetch()} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen title="Deck">
        <Centered>
          <Heading>{count ? 'Nothing matches' : 'Nothing left to swipe'}</Heading>
          <Message
            text={
              count
                ? 'Your filters are narrower than the deck.'
                : 'Check back once more dealers are approved.'
            }
          />
          {count ? (
            <Button label="Clear filters" variant="secondary" onPress={clear} />
          ) : (
            <Button label="Refresh" variant="secondary" onPress={() => refetch()} />
          )}
        </Centered>
      </Screen>
    );
  }

  if (view === 'grid') {
    return (
      <Screen title="Deck" action={toggle}>
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
    <Screen title="Deck" action={toggle}>
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
      {count ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/search')}
          style={styles.hintRow}>
          <Text style={styles.hint}>{`Filtered to ${cards.length} · tap to change`}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const deckStyles = (theme: Theme) => ({
  stage: {
    flex: 1,
    marginHorizontal: inset.screen,
    marginBottom: inset.screen,
  },
  hintRow: {
    paddingBottom: inset.screen,
  },
  hint: {
    ...type.caption,
    color: theme.color.textFaint,
    textAlign: 'center' as const,
  },
});
