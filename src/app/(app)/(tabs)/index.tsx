import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SwipeCard } from '@/components/SwipeCard';
import { Button, Centered, Message, Screen } from '@/components/ui';
import type { DeckCard, SwipeDirection } from '@/lib/database.types';
import { fetchDeck, recordSwipe } from '@/lib/queries';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function Deck() {
  const { userId } = useSession();
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCards(await fetchDeck());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the deck.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSwipe = useCallback(
    (card: DeckCard, direction: SwipeDirection) => {
      setCards((current) => current.filter((c) => c.id !== card.id));
      if (!userId) return;
      // Optimistic: the card is already gone, so a failed write only costs a repeat.
      recordSwipe(userId, card.id, direction).catch(() => undefined);
    },
    [userId]
  );

  if (loading) {
    return (
      <Screen title="Deck">
        <Centered>
          <ActivityIndicator />
        </Centered>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Deck">
        <Centered>
          <Message text={error} tone="error" />
          <Button label="Try again" variant="secondary" onPress={load} />
        </Centered>
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen title="Deck">
        <Centered>
          <Text style={styles.emptyTitle}>Nothing left to swipe</Text>
          <Message text="Import listings from a site, or check back once more sellers do." />
          <Button label="Refresh" variant="secondary" onPress={load} />
        </Centered>
      </Screen>
    );
  }

  // Render a couple of cards deep so the next one is visible under the top card.
  const visible = cards.slice(0, 3).reverse();

  return (
    <Screen title="Deck">
      <View style={styles.stage}>
        {visible.map((card, index) => (
          <SwipeCard
            key={card.id}
            card={card}
            isTop={index === visible.length - 1}
            onSwipe={(direction) => onSwipe(card, direction)}
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
