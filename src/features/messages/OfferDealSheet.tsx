import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SocialButton } from '@/components/SocialButton';
import { Message } from '@/components/ui';
import { useCreateDeal, useReviseDeal } from '@/data/deals';
import type { MessageListing } from '@/data/messages';
import {
  centsToPriceDigits,
  PostPriceField,
  priceDigitsToCents,
} from '@/features/exchange/PostPriceField';
import { feeCentsFromBps, formatCents } from '@/lib/money';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealListingDelta } from './DealListingDelta';
import { ListingQuote } from './ListingQuote';

const FEE_BPS = 500;

export function OfferDealSheet({
  visible,
  conversationId,
  listing,
  editDeal,
  onOpenListing,
  onClose,
}: {
  visible: boolean;
  conversationId: string;
  listing: MessageListing;
  /** When set, Confirm updates this open offer instead of creating a new deal. */
  editDeal?: { id: string; amountCents: number } | null;
  onOpenListing: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(sheetStyles);
  const create = useCreateDeal(conversationId);
  const revise = useReviseDeal(conversationId);
  const [digits, setDigits] = useState('');
  const editing = Boolean(editDeal);

  useEffect(() => {
    if (!visible) {
      setDigits('');
      return;
    }
    const seed = editDeal?.amountCents ?? listing.priceCents ?? null;
    setDigits(centsToPriceDigits(seed));
  }, [visible, listing.priceCents, editDeal?.amountCents, editDeal?.id]);

  const cents = priceDigitsToCents(digits);
  const fee = cents ? feeCentsFromBps(cents, FEE_BPS) : null;
  const net = cents && fee !== null ? cents - fee : null;

  const saving = create.isPending || revise.isPending;
  const saveError = create.error ?? revise.error;

  const confirmSend = () => {
    if (!cents || fee === null || net === null) return;
    const title = editing ? 'Update this offer?' : 'Send this offer?';
    const confirmLabel = editing ? 'Update offer' : 'Send offer';
    Alert.alert(
      title,
      `${formatCents(cents)} on ${listing.title}.\nYou receive ${formatCents(net)} after ${formatCents(fee)} commission.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirmLabel,
          onPress: () => {
            const onSuccess = () => {
              setDigits('');
              onClose();
            };
            if (editing && editDeal) {
              revise.mutate({ dealId: editDeal.id, amountCents: cents }, { onSuccess });
            } else {
              create.mutate(
                { amountCents: cents, proposerIsSeller: true, listingId: listing.id },
                { onSuccess },
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + inset.screen }]}>
        <Text style={styles.heading}>{editing ? 'Edit offer' : 'Offer a deal'}</Text>
        <ListingQuote listing={listing} onPress={onOpenListing} layout="card" />

        <PostPriceField intent="sell" digits={digits} onChangeDigits={setDigits} showKicker={false} />

        {cents ? (
          <DealListingDelta offerCents={cents} listPriceCents={listing.priceCents} />
        ) : listing.priceCents ? (
          <Text style={styles.listedOnly}>
            Listed {formatCents(listing.priceCents)}
          </Text>
        ) : null}

        {cents && fee !== null && net !== null ? (
          <View style={styles.expenses}>
            <ExpenseLine label="Offer" amount={formatCents(cents)} />
            <ExpenseLine label="Graham commission (5%)" amount={formatCents(fee)} />
            <ExpenseLine label="You receive" amount={formatCents(net)} strong />
          </View>
        ) : null}

        {saveError ? <Message text={saveError.message} tone="error" /> : null}
        <View style={styles.actions}>
          <SocialButton
            label="Confirm"
            solid
            block
            busy={saving}
            disabled={!cents}
            onPress={confirmSend}
          />
          <SocialButton label="Cancel" block disabled={saving} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function ExpenseLine({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: string;
  strong?: boolean;
}) {
  const styles = useThemedStyles(expenseStyles);
  return (
    <View style={styles.row}>
      <Text style={[styles.label, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.amount, strong && styles.strong]}>{amount}</Text>
    </View>
  );
}

const sheetStyles = (_theme: Theme) => ({
  scrim: {
    flex: 1,
    backgroundColor: _theme.color.overlay,
  },
  sheet: {
    backgroundColor: _theme.color.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: inset.screen,
    paddingTop: space.lg,
    gap: stack.related,
  },
  heading: {
    ...type.title,
    color: _theme.color.text,
  },
  listedOnly: {
    ...type.caption,
    color: _theme.color.textMuted,
  },
  expenses: {
    gap: stack.tight,
    paddingTop: space.sm,
  },
  actions: {
    gap: space.sm,
  },
});

const expenseStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: space.md,
  },
  label: {
    ...type.body,
    color: theme.color.text,
    flex: 1,
  },
  amount: {
    ...type.body,
    color: theme.color.money,
  },
  strong: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
});
