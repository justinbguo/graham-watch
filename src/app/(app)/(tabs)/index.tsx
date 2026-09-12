import { StyleSheet, Text, View } from 'react-native';

import { SwipeCard } from '@/components/SwipeCard';
import { Button, Centered, Message, Screen, Spinner } from '@/components/ui';
import { useDeck } from '@/data/listings';
import { useRecordSwipe } from '@/data/swipes';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function Deck() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error, refetch } = useDeck();
  const swipe = useRecordSwipe(userId);

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
          <Text style={styles.emptyTitle}>Nothing left to swipe</Text>
          <Message text="Import a dealer's site, or check back once more listings are approved." />
          <Button label="Refresh" variant="secondary" onPress={() => refetch()} />
        </Centered>
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
      <Text style={styles.hint}>Swipe right to save · left to pass</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    margin: theme.space(2),
  },
  hint: {
    textAlign: 'center',
    color: theme.color.muted,
    fontSize: 13,
    paddingBottom: theme.space(1.5),
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.color.text,
  },
});
