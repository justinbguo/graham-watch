import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Centered, Heading, Message, Screen, Spinner } from '@/components/ui';
import { inquiryByListing, useInquiries } from '@/data/inquiries';
import { useSaved } from '@/data/listings';
import { useUnsave } from '@/data/swipes';
import { totalPrice } from '@/lib/format';
import type { DeckCard, Inquiry } from '@/lib/models';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

/** Sold has no button. Sent is a status. Failed/pending can retry. Else Contact. */
function savedAction(card: DeckCard, inquiry: Inquiry | undefined) {
  if (card.sold_at) return {};
  if (inquiry?.status === 'sent') return { actionLabel: 'Contacted' };
  if (inquiry?.status === 'failed' || inquiry?.status === 'pending') {
    return {
      actionLabel: 'Retry',
      onAction: () => router.push(`/inquiry/${card.id}`),
    };
  }
  return {
    actionLabel: 'Contact',
    onAction: () => router.push(`/inquiry/${card.id}`),
  };
}

export default function Saved() {
  const { userId } = useSession();
  const { data: cards = [], isPending, error } = useSaved(userId);
  const { data: inquiries = [] } = useInquiries(userId);
  const unsave = useUnsave(userId);
  const styles = useThemedStyles(savedStyles);
  const byListing = inquiryByListing(inquiries);

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

  const { total, onRequest } = totalPrice(cards);

  // Nothing saved, nothing to add up. An empty list with "$0" beside it reads
  // like a price rather than an absence.
  const action = cards.length ? (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{total ?? `${cards.length} saved`}</Text>
      {onRequest ? <Text style={styles.totalNote}>{onRequest} on request</Text> : null}
    </View>
  ) : null;

  return (
    <Screen title="Saved" action={action}>
      <FlatList
        data={cards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const rowAction = savedAction(item, byListing.get(item.id));
          return (
            <ListingRow
              card={item}
              actionLabel={rowAction.actionLabel}
              onPress={() => router.push(`/listing/${item.id}`)}
              onAction={rowAction.onAction}
              onLongPress={() => unsave.mutate(item.id)}
            />
          );
        }}
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
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.border,
  },
  total: {
    alignItems: 'flex-end' as const,
    gap: space.xs,
  },
  totalValue: {
    ...type.price,
    color: theme.color.text,
  },
  totalNote: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  footerHint: {
    ...type.caption,
    color: theme.color.textFaint,
    paddingTop: space.lg,
    paddingBottom: inset.screen,
  },
});
