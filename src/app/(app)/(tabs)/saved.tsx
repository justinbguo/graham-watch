import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, Message, Screen } from '@/components/ui';
import type { DeckCard } from '@/lib/database.types';
import { fetchSaved, unsave } from '@/lib/queries';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function Saved() {
  const { userId } = useSession();
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      setCards(await fetchSaved(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load saved watches.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const remove = async (listingId: string) => {
    if (!userId) return;
    setCards((current) => current.filter((c) => c.id !== listingId));
    await unsave(userId, listingId).catch(() => undefined);
  };

  if (loading) {
    return (
      <Screen title="Saved">
        <Centered>
          <ActivityIndicator />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Saved">
      {error ? (
        <Centered>
          <Message text={error} tone="error" />
        </Centered>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <ListingRow card={item} actionLabel="Remove" onAction={() => remove(item.id)} />
          )}
          ListEmptyComponent={
            <Centered>
              <Text style={styles.emptyTitle}>Nothing saved yet</Text>
              <Message text="Swipe right on the deck and it lands here." />
            </Centered>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: theme.space(2),
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.color.text,
  },
});
