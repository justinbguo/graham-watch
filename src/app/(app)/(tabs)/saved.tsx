import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert, SectionList, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { SwipeToRemove } from '@/components/SwipeToRemove';
import { Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { usePrimeListing, useSaved } from '@/data/listings';
import { useListingThreads, useMessageAboutListing } from '@/data/messages';
import { useUnsave } from '@/data/swipes';
import { GuestGate } from '@/features/auth/GuestGate';
import { useOpenStack } from '@/lib/openStack';
import { formatMessageDay, formatTitle, totalPrice } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Saved() {
  const { userId, isSignedIn } = useSession();
  const { data: cards = [], isPending, error } = useSaved(userId);

  if (!isSignedIn) {
    return (
      <GuestGate
        title="Wishlist"
        message="Sign in to keep the watches you save and message the dealers who have them."
      />
    );
  }
  const threads = useListingThreads(userId);
  const unsave = useUnsave(userId);
  const message = useMessageAboutListing();
  const primeListing = usePrimeListing();
  const open = useOpenStack();
  const styles = useThemedStyles(savedStyles);
  const refetchThreads = threads.refetch;
  // The thread is a screen on top of this one. Coming back is the moment a
  // watch you just wrote about should move into the group at the top.
  useFocusEffect(
    useCallback(() => {
      void refetchThreads();
    }, [refetchThreads]),
  );

  const { total, onRequest } = totalPrice(cards);
  const spoken = threads.data ?? {};
  const inConversation = cards.filter((card) => spoken[card.id]);
  const rest = cards.filter((card) => !spoken[card.id]);
  const sections: { key: string; data: DeckCard[] }[] = [];
  if (inConversation.length) sections.push({ key: 'talking', data: inConversation });
  if (rest.length) sections.push({ key: 'rest', data: rest });

  // Nothing saved, nothing to add up. An empty list with "$0" beside it reads
  // like a price rather than an absence.
  const action = cards.length ? (
    <View style={styles.total}>
      <Text style={styles.totalValue}>
        {total ?? `${cards.length} watch${cards.length === 1 ? '' : 'es'}`}
      </Text>
      {onRequest ? <Text style={styles.totalNote}>{onRequest} on request</Text> : null}
    </View>
  ) : undefined;

  if (isPending || threads.isPending) {
    return (
      <Screen title="Wishlist" inTabs action={action}>
        <Spinner />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Wishlist" inTabs action={action}>
        <Centered>
          <Message text={error.message} tone="error" />
        </Centered>
      </Screen>
    );
  }

  const writeAbout = (item: DeckCard) => {
    message.mutate(item.id, {
      onSuccess: (conversationId) =>
        open(
          'conversation/[conversationId]',
          { conversationId, listingId: item.id },
          `/conversation/${conversationId}?listingId=${item.id}`,
        ),
      onError: (error) => Alert.alert('Could not open that message', error.message),
    });
  };

  return (
    <Screen title="Wishlist" action={action} inTabs>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.section, section.key === 'rest' && inConversation.length > 0 && styles.sectionNext]}>
            {section.key === 'talking' ? 'Pending watches' : 'Saved watches'}
          </Text>
        )}
        renderItem={({ item }) => (
          <SwipeToRemove
            accessibilityLabel={`Remove ${formatTitle(item)} from wishlist`}
            onRemove={() => unsave.mutate(item.id)}>
            <ListingRow
              card={item}
              compact
              note={
                spoken[item.id]?.body ??
                (!item.sold_at && item.dealer ? 'Tap to inquire about the watch' : undefined)
              }
              notedAt={spoken[item.id] ? formatMessageDay(spoken[item.id].at) : undefined}
              prompt={!spoken[item.id]}
              inConversation={Boolean(spoken[item.id])}
              attention={!spoken[item.id] && !item.sold_at && Boolean(item.dealer)}
              messagePending={message.isPending && message.variables === item.id}
              onPress={() => {
                primeListing(item);
                open('listing/[listingId]', { listingId: item.id }, `/listing/${item.id}`);
              }}
              onMessage={
                (!item.sold_at && item.dealer) || spoken[item.id] ? () => writeAbout(item) : undefined
              }
            />
          </SwipeToRemove>
        )}
        ListEmptyComponent={
          <Centered>
            <Heading>Your wishlist is empty</Heading>
            <Message text="Swipe right on the deck and it lands here." />
          </Centered>
        }
      />
    </Screen>
  );
}

const savedStyles = (theme: Theme) => ({
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
    flexGrow: 1,
  },
  // A hairline, not a gap: the rows have no card, so the line is the edge.
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  // Same face as Profile's Wishlist and Following. Opaque, because the header
  // sticks and the rows scroll under it.
  section: {
    ...type.title,
    color: theme.color.text,
    backgroundColor: theme.color.background,
    paddingBottom: space.xs,
  },
  sectionNext: {
    paddingTop: space.lg,
  },
});
