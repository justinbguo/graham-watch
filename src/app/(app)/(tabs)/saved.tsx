import { useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { SwipeToRemove } from '@/components/SwipeToRemove';
import { Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useOpenMailDraft } from '@/data/inquiries';
import { usePrimeListing, useSaved } from '@/data/listings';
import { useUnsave } from '@/data/swipes';
import { MessagesButton } from '@/features/messages/MessagesButton';
import { MessagesView } from '@/features/messages/MessagesView';
import { useOpenStack } from '@/lib/openStack';
import { formatTitle, totalPrice } from '@/lib/format';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Saved() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error } = useSaved(userId);
  const unsave = useUnsave(userId);
  const contact = useOpenMailDraft(userId);
  const primeListing = usePrimeListing();
  const open = useOpenStack();
  const styles = useThemedStyles(savedStyles);
  const [messages, setMessages] = useState(false);

  if (messages) {
    return <MessagesView onClose={() => setMessages(false)} />;
  }

  const { total, onRequest } = totalPrice(cards);

  // Nothing saved, nothing to add up. An empty list with "$0" beside it reads
  // like a price rather than an absence. The bubble stays either way: messages
  // are not a property of the list.
  const action = (
    <View style={styles.action}>
      {cards.length ? (
        <View style={styles.total}>
          <Text style={styles.totalValue}>{total ?? `${cards.length} saved`}</Text>
          {onRequest ? <Text style={styles.totalNote}>{onRequest} on request</Text> : null}
        </View>
      ) : null}
      <MessagesButton onPress={() => setMessages(true)} />
    </View>
  );

  if (isPending) {
    return (
      <Screen title="Saved" inTabs action={action}>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Saved" inTabs action={action}>
        <Centered>
          <Message text={error.message} tone="error" />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Saved" action={action} inTabs>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SwipeToRemove
            accessibilityLabel={`Remove ${formatTitle(item)} from Saved`}
            onRemove={() => unsave.mutate(item.id)}>
            <ListingRow
              card={item}
              actionIcon="email"
              actionLabel="Contact dealer"
              actionPending={contact.isPending && contact.variables?.card.id === item.id}
              onPress={() => {
                primeListing(item);
                open('listing/[listingId]', { listingId: item.id }, `/listing/${item.id}`);
              }}
              onAction={() => {
                contact.mutate(
                  { card: item, message: '' },
                  {
                    onError: (error) => Alert.alert('Could not open Gmail', error.message),
                  }
                );
              }}
            />
          </SwipeToRemove>
        )}
        ListEmptyComponent={
          <Centered>
            <Heading>Nothing saved yet</Heading>
            <Message text="Swipe right on the deck and it lands here." />
          </Centered>
        }
      />
    </Screen>
  );
}

const savedStyles = (theme: Theme) => ({
  action: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  total: {
    alignItems: 'flex-end' as const,
  },
  totalValue: {
    ...type.price,
    color: theme.color.text,
  },
  totalNote: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    gap: space.lg,
    flexGrow: 1,
  },
});
