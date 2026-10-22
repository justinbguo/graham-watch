import { Text, View } from 'react-native';

import { SocialButton } from '@/components/SocialButton';
import type { ConversationDeal } from '@/data/deals';
import { dealIsOpen, estimatedFeeCents, isDealExpired } from '@/data/deals';
import type { MessageListing } from '@/data/messages';
import { formatShortDate, formatTimeLeft } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealListingDelta } from './DealListingDelta';
import { ListingQuote } from './ListingQuote';

export type DealCardActions = {
  onAccept?: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  onCounter?: () => void;
  onCheckout?: () => void;
  onShip?: () => void;
  onConfirmReceipt?: () => void;
  onReview?: () => void;
};

export function DealCard({
  deal,
  mine,
  viewerId,
  listing,
  onOpenListing,
  busy,
  ...actions
}: DealCardActions & {
  deal: ConversationDeal;
  mine: boolean;
  viewerId: string;
  listing?: MessageListing | null;
  onOpenListing?: () => void;
  busy?: boolean;
}) {
  const styles = useThemedStyles(dealStyles);
  const fee = estimatedFeeCents(deal);
  const isBuyer = viewerId === deal.buyerId;
  const isSeller = viewerId === deal.sellerId;
  const open = dealIsOpen(deal);
  const accentCard = mine;
  const ink = accentCard ? styles.onAccent : undefined;
  const inkMuted = accentCard ? styles.onAccentMuted : undefined;

  return (
    <View
      style={[
        styles.card,
        mine ? styles.cardMine : styles.cardTheirs,
        accentCard && styles.cardAccent,
      ]}>
      <Text style={[styles.eyebrow, inkMuted]}>Deal</Text>
      {listing && onOpenListing ? (
        <ListingQuote
          listing={listing}
          onPress={onOpenListing}
          layout="card"
          inverse={accentCard}
        />
      ) : null}
      <Text style={[styles.amount, ink]}>{formatCents(deal.amountCents, deal.currency)}</Text>
      <DealListingDelta
        offerCents={deal.amountCents}
        listPriceCents={listing?.priceCents}
        currency={deal.currency}
        onAccent={accentCard}
      />
      <Text style={[styles.status, ink]}>{statusLabel(deal, isBuyer)}</Text>
      <DealTimeline deal={deal} isBuyer={isBuyer} onAccent={accentCard} />
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
      <DealActions
        deal={deal}
        open={open}
        isBuyer={isBuyer}
        isSeller={isSeller}
        viewerId={viewerId}
        busy={busy}
        actions={actions}
      />
    </View>
  );
}

function statusLabel(deal: ConversationDeal, isBuyer: boolean): string {
  if (isDealExpired(deal)) return 'Expired';
  switch (deal.status) {
    case 'proposed':
      return 'Awaiting response';
    case 'accepted':
      return isBuyer ? 'Accepted — ready to pay' : 'Accepted — awaiting payment';
    case 'funded':
      return isBuyer ? 'Paid — awaiting shipment' : 'Paid — ship it';
    case 'shipped':
      return isBuyer ? 'Shipped — confirm when it arrives' : 'Shipped';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return deal.cancelledReason === 'listing_reserved'
        ? 'Closed — another offer was accepted'
        : 'Cancelled';
    case 'expired':
      return 'Expired';
  }
}

/** One line of context under the status: clock, ship-by, tracking. */
function DealTimeline({
  deal,
  isBuyer,
  onAccent,
}: {
  deal: ConversationDeal;
  isBuyer: boolean;
  onAccent: boolean;
}) {
  const styles = useThemedStyles(dealStyles);
  const line = timelineLine(deal, isBuyer);
  if (!line) return null;
  return (
    <Text style={[styles.timeline, onAccent && styles.onAccentMuted]} selectable>
      {line}
    </Text>
  );
}

function timelineLine(deal: ConversationDeal, isBuyer: boolean): string | null {
  if (deal.status === 'proposed' && deal.expiresAt) {
    const left = formatTimeLeft(deal.expiresAt);
    return left ? `Expires in ${left}` : 'This offer has expired.';
  }
  if (deal.status === 'funded' && deal.shipBy) {
    return isBuyer
      ? `Seller ships by ${formatShortDate(deal.shipBy)}.`
      : `Ship by ${formatShortDate(deal.shipBy)}. Add tracking when it leaves.`;
  }
  if ((deal.status === 'shipped' || deal.status === 'completed') && deal.trackingNumber) {
    return `${deal.trackingCarrier ?? 'Tracking'} ${deal.trackingNumber}`;
  }
  return null;
}

function DealActions({
  deal,
  open,
  isBuyer,
  isSeller,
  viewerId,
  busy,
  actions,
}: {
  deal: ConversationDeal;
  open: boolean;
  isBuyer: boolean;
  isSeller: boolean;
  viewerId: string;
  busy?: boolean;
  actions: DealCardActions;
}) {
  const styles = useThemedStyles(dealStyles);

  if (open) {
    const theirs = deal.proposedBy !== viewerId;
    if (theirs && (isBuyer || isSeller)) {
      return (
        <View style={styles.actions}>
          <SocialButton
            label="Accept offer"
            solid
            block
            disabled={busy || !actions.onAccept}
            onPress={() => actions.onAccept?.()}
          />
          <View style={styles.actionRow}>
            <SocialButton
              label="Counteroffer"
              rowItem
              disabled={busy || !actions.onCounter}
              onPress={() => actions.onCounter?.()}
            />
            <SocialButton label="Decline" rowItem disabled={busy} onPress={actions.onDecline} />
          </View>
        </View>
      );
    }
    if (isSeller) {
      return (
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <SocialButton
              label="Edit offer"
              rowItem
              disabled={busy || !actions.onEdit}
              onPress={() => actions.onEdit?.()}
            />
            <SocialButton label="Cancel" rowItem disabled={busy} onPress={actions.onCancel} />
          </View>
        </View>
      );
    }
    return null;
  }

  if (deal.status === 'accepted' && isBuyer) {
    return (
      <View style={styles.actions}>
        <SocialButton
          label="Continue to checkout"
          solid
          block
          disabled={busy || !actions.onCheckout}
          onPress={() => actions.onCheckout?.()}
        />
      </View>
    );
  }

  if (deal.status === 'funded' && isSeller) {
    return (
      <View style={styles.actions}>
        <SocialButton
          label="Mark shipped"
          solid
          block
          disabled={busy || !actions.onShip}
          onPress={() => actions.onShip?.()}
        />
      </View>
    );
  }

  if (deal.status === 'shipped' && isBuyer) {
    return (
      <View style={styles.actions}>
        <SocialButton
          label="Confirm receipt"
          solid
          block
          disabled={busy || !actions.onConfirmReceipt}
          onPress={() => actions.onConfirmReceipt?.()}
        />
      </View>
    );
  }

  if (deal.status === 'completed' && isBuyer && !deal.reviewedAt) {
    return (
      <View style={styles.actions}>
        <SocialButton
          label="Rate the seller"
          block
          disabled={busy || !actions.onReview}
          onPress={() => actions.onReview?.()}
        />
      </View>
    );
  }

  return null;
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
  timeline: {
    ...type.caption,
    color: theme.color.textMuted,
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
