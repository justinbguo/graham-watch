import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { DeckGrid } from '@/components/DeckGrid';
import { SwipeCard } from '@/components/SwipeCard';
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

  if (isWide) {
    return (
      <Screen title="Deck">
        <DeckGrid
          cards={cards}
          onSwipe={(card, direction) => swipe.mutate({ listingId: card.id, direction })}
        />
      </Screen>
    );
  }

  // Render a few cards deep so the next one shows under the top card.
  const visible = cards.slice(0, 3).reverse();

  return (
    <Screen title="Deck">
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
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/search')}
        style={styles.hintRow}>
        <Text style={styles.hint}>
          {count
            ? `Filtered to ${cards.length} · tap to change`
            : 'Swipe right to save · left to pass'}
        </Text>
      </Pressable>
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
