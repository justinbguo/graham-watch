import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import type { ConversationDeal } from '@/data/deals';
import { estimatedFeeCents } from '@/data/deals';
import type { MessageListing } from '@/data/messages';
import { formatCents } from '@/lib/money';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ListingQuote } from './ListingQuote';

const STATUS_LABEL: Record<ConversationDeal['status'], string> = {
  proposed: 'Awaiting payment',
  accepted: 'Accepted',
  funded: 'Payment held',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export function DealCard({
  deal,
  mine,
  viewerId,
  listing,
  onOpenListing,
  onDecline,
  onCancel,
  busy,
}: {
  deal: ConversationDeal;
  mine: boolean;
  viewerId: string;
  listing?: MessageListing | null;
  onOpenListing?: () => void;
  onDecline: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const styles = useThemedStyles(dealStyles);
  const fee = estimatedFeeCents(deal);
  const isBuyer = viewerId === deal.buyerId;
  const isSeller = viewerId === deal.sellerId;
  const open = deal.status === 'proposed';

  const pay = () => {
    Alert.alert(
      'Apple Pay coming soon',
      'This will place a payment hold with Apple Pay. The seller is paid after you confirm receipt; Graham keeps a transaction fee.',
    );
  };

  return (
    <View style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}>
      <Text style={styles.eyebrow}>Deal</Text>
      <Text style={styles.amount}>{formatCents(deal.amountCents, deal.currency)}</Text>
      <Text style={styles.status}>{STATUS_LABEL[deal.status]}</Text>
      <Text style={styles.fee}>
        Graham fee at payment (est.): {formatCents(fee, deal.currency)}
      </Text>
      {listing && onOpenListing ? (
        <ListingQuote listing={listing} onPress={onOpenListing} mine={mine} />
      ) : null}
      {open ? (
        <View style={styles.actions}>
          {isBuyer && deal.proposedBy !== viewerId ? (
            <>
              <Button label="Pay with Apple Pay" onPress={pay} disabled={busy} />
              <Button label="Decline" variant="ghost" disabled={busy} onPress={onDecline} />
            </>
          ) : null}
          {isSeller && deal.proposedBy === viewerId ? (
            <Button label="Cancel offer" variant="ghost" disabled={busy} onPress={onCancel} />
          ) : null}
          {isSeller && deal.proposedBy !== viewerId ? (
            <Button label="Decline" variant="ghost" disabled={busy} onPress={onDecline} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const dealStyles = (theme: Theme) => ({
  card: {
    maxWidth: '88%' as const,
    gap: stack.tight,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: theme.color.surface,
  },
  cardMine: {
    alignSelf: 'flex-end' as const,
  },
  cardTheirs: {
    alignSelf: 'flex-start' as const,
  },
  eyebrow: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  amount: {
    ...type.title,
    color: theme.color.money,
  },
  status: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  fee: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.xs,
  },
});
