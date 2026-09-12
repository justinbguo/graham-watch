import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, Message, Screen, Spinner } from '@/components/ui';
import { useSaved } from '@/data/listings';
import { useUnsave } from '@/data/swipes';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function Saved() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error } = useSaved(userId);
  const unsave = useUnsave(userId);

  if (isPending) {
    return (
      <Screen title="Saved">
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Saved">
        <Centered>
          <Message text={error.message} tone="error" />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Saved">
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <ListingRow
            card={item}
            actionLabel="Contact"
            onAction={() => router.push(`/inquiry/${item.id}`)}
            onLongPress={() => unsave.mutate(item.id)}
          />
        )}
        ListEmptyComponent={
          <Centered>
            <Text style={styles.emptyTitle}>Nothing saved yet</Text>
            <Message text="Swipe right on the deck and it lands here." />
          </Centered>
        }
        ListFooterComponent={
          cards.length ? (
            <Text style={styles.footerHint}>Long-press a watch to remove it.</Text>
          ) : null
        }
      />
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
  footerHint: {
    fontSize: 13,
    color: theme.color.muted,
    paddingVertical: theme.space(2),
    textAlign: 'center',
  },
});
