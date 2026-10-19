import { Alert, Text, View } from 'react-native';

import { SocialButton } from '@/components/SocialButton';
import type { ConversationDeal } from '@/data/deals';
import { estimatedFeeCents } from '@/data/deals';
import type { MessageListing } from '@/data/messages';
import { formatCents } from '@/lib/money';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealListingDelta } from './DealListingDelta';
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
  onEdit,
  busy,
}: {
  deal: ConversationDeal;
  mine: boolean;
  viewerId: string;
  listing?: MessageListing | null;
  onOpenListing?: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  busy?: boolean;
}) {
  const styles = useThemedStyles(dealStyles);
  const fee = estimatedFeeCents(deal);
  const isBuyer = viewerId === deal.buyerId;
  const isSeller = viewerId === deal.sellerId;
  const open = deal.status === 'proposed';
  const accentCard = mine;

  const pay = () => {
    Alert.alert(
      'Apple Pay coming soon',
      'You pay into this deal with Apple Pay. The seller is paid after you confirm receipt; Graham keeps a transaction fee.',
    );
  };

  return (
    <View
      style={[
        styles.card,
        mine ? styles.cardMine : styles.cardTheirs,
        accentCard && styles.cardAccent,
      ]}>
      <Text style={[styles.eyebrow, accentCard && styles.onAccentMuted]}>Deal</Text>
      {listing && onOpenListing ? (
        <ListingQuote
          listing={listing}
          onPress={onOpenListing}
          layout="card"
          inverse={accentCard}
        />
      ) : null}
      <Text style={[styles.amount, accentCard && styles.onAccent]}>
        {formatCents(deal.amountCents, deal.currency)}
      </Text>
      <DealListingDelta
        offerCents={deal.amountCents}
        listPriceCents={listing?.priceCents}
        currency={deal.currency}
        onAccent={accentCard}
      />
      <Text style={[styles.status, accentCard && styles.onAccent]}>{STATUS_LABEL[deal.status]}</Text>
      <View style={styles.expenses}>
        <DealExpense
          label="Offer"
          amount={formatCents(deal.amountCents, deal.currency)}
          onAccent={accentCard}
        />
        <DealExpense
          label="Graham commission (5%)"
          amount={formatCents(fee, deal.currency)}
          onAccent={accentCard}
        />
        <DealExpense
          label={isBuyer ? 'You pay' : 'You receive'}
          amount={formatCents(
            isBuyer ? deal.amountCents : deal.amountCents - fee,
            deal.currency,
          )}
          strong
          onAccent={accentCard}
        />
      </View>
      {open ? (
        <View style={styles.actions}>
          {isBuyer && deal.proposedBy !== viewerId ? (
            <>
              <SocialButton label="Pay with Apple Pay" solid block onPress={pay} disabled={busy} />
              <SocialButton label="Decline" block disabled={busy} onPress={onDecline} />
            </>
          ) : null}
          {isSeller && deal.proposedBy === viewerId ? (
            <View style={styles.actionRow}>
              <SocialButton
                label="Edit offer"
                rowItem
                disabled={busy || !onEdit}
                onPress={() => onEdit?.()}
              />
              <SocialButton label="Cancel" rowItem disabled={busy} onPress={onCancel} />
            </View>
          ) : null}
          {isSeller && deal.proposedBy !== viewerId ? (
            <SocialButton label="Decline" block disabled={busy} onPress={onDecline} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DealExpense({
  label,
  amount,
  strong = false,
  onAccent = false,
}: {
  label: string;
  amount: string;
  strong?: boolean;
  onAccent?: boolean;
}) {
  const styles = useThemedStyles(dealExpenseStyles);
  const ink = onAccent ? styles.onAccent : undefined;
  return (
    <View style={styles.row}>
      <Text
        style={[styles.label, strong && styles.strong, ink, strong && onAccent && styles.onAccentStrong]}
        numberOfLines={2}
        ellipsizeMode="tail">
        {label}
      </Text>
      <Text
        style={[styles.amount, strong && styles.strong, ink, strong && onAccent && styles.onAccentStrong]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}>
        {amount}
      </Text>
    </View>
  );
}

const dealExpenseStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  label: {
    ...type.body,
    color: theme.color.text,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  amount: {
    ...type.body,
    color: theme.color.money,
    flexShrink: 0,
    maxWidth: '46%' as const,
    textAlign: 'right' as const,
  },
  strong: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  onAccent: {
    color: theme.color.onAccent,
  },
  onAccentStrong: {
    ...type.bodyStrong,
    color: theme.color.onAccent,
  },
});

const dealStyles = (theme: Theme) => ({
  card: {
    width: '88%' as const,
    maxWidth: '88%' as const,
    minWidth: 0,
    gap: stack.related,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: theme.color.surface,
    overflow: 'hidden' as const,
  },
  cardAccent: {
    backgroundColor: theme.color.accent,
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
  onAccentMuted: {
    color: theme.color.onAccent,
    opacity: 0.72,
  },
  onAccent: {
    color: theme.color.onAccent,
  },
  amount: {
    ...type.title,
    color: theme.color.money,
  },
  status: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  expenses: {
    gap: stack.tight,
    width: '100%' as const,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.xs,
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
  actionRow: {
    flexDirection: 'row' as const,
    gap: space.sm,
    alignSelf: 'stretch' as const,
    width: '100%' as const,
  },
});
