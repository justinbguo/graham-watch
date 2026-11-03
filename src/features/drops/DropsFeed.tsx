import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useDropFeed, useMarkDropsSeen } from '@/data/drops';
import { usePrimeListing } from '@/data/listings';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

/**
 * Watches listed by shops this buyer follows, after they followed.
 * The count on Profile clears when this screen opens. The rows stay.
 */
export function DropsFeed() {
  const { userId } = useSession();
  const styles = useThemedStyles(feedStyles);
  const open = useOpenStack();
  const primeListing = usePrimeListing();
  const { data, isPending, error } = useDropFeed(userId);
  const { mutate: markSeen } = useMarkDropsSeen();

  // The count clears when the list is on screen. Marking does not refetch this
  // list, so the rows stay put.
  useEffect(() => {
    if (!userId || !data) return;
    markSeen(null);
  }, [userId, data, markSeen]);

  const close = () => router.back();

  if (!userId) {
    return (
      <Screen title="New watches" action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="Sign in to see watches from dealers you follow." />
        </Centered>
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen title="New watches" subtitle="From dealers you follow" action={<CloseButton onPress={close} />}>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="New watches" action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="Those watches could not be loaded." tone="error" />
        </Centered>
      </Screen>
    );
  }

  const cards = data ?? [];

  return (
    <Screen title="New watches" subtitle="From dealers you follow" action={<CloseButton onPress={close} />}>
      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Message text="Nothing new from dealers you follow." />}
        renderItem={({ item }) => (
          <ListingRow
            card={item}
            onPress={() => {
              primeListing(item);
              open('listing/[listingId]', { listingId: item.id }, `/listing/${item.id}`);
            }}
          />
        )}
      />
    </Screen>
  );
}

const feedStyles = (_theme: Theme) => ({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
});
