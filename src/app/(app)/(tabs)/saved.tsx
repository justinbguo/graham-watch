import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useSaved } from '@/data/listings';
import { useUnsave } from '@/data/swipes';
import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export default function Saved() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error } = useSaved(userId);
  const unsave = useUnsave(userId);
  const styles = useThemedStyles(savedStyles);

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
            <Heading>Nothing saved yet</Heading>
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

const savedStyles = (theme: Theme) => ({
  list: {
    paddingHorizontal: space.lg,
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  footerHint: {
    ...type.caption,
    color: theme.color.textFaint,
    paddingVertical: space.xl,
    textAlign: 'center' as const,
  },
});
