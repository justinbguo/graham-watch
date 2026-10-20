import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SocialButton } from '@/components/SocialButton';
import { Eyebrow, Message } from '@/components/ui';
import {
  EMPTY_SHIP_TO,
  shipToIsComplete,
  TEST_PAYMENT_LABEL,
  useCheckoutDefaults,
  useSaveCheckoutDefaults,
  type ShipTo,
} from '@/data/checkout';
import { estimatedFeeCents, useFundDeal, type ConversationDeal } from '@/data/deals';
import type { MessageListing } from '@/data/messages';
import { SaveToggle } from '@/features/checkout/SaveToggle';
import { ShippingAddressFields } from '@/features/checkout/ShippingAddressFields';
import { formatCents } from '@/lib/money';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { DealSheetShell, dealSheetActionStyles } from './DealSheetShell';

/**
 * Buyer side of an accepted offer. Phase 0: no card is charged. The RPC records
 * the ship-to, marks the deal funded with a `dev_hold`, and starts the seller's
 * five-day shipping clock. Stripe replaces the payment block later; the address
 * block and the save toggles stay.
 */
export function DealCheckoutSheet({
  visible,
  deal,
  listing,
  onClose,
}: {
  visible: boolean;
  deal: ConversationDeal | null;
  listing: MessageListing | null;
  onClose: () => void;
}) {
  const { userId } = useSession();
  const styles = useThemedStyles(checkoutStyles);
  const { data: defaults, isPending: defaultsPending } = useCheckoutDefaults(userId);
  const saveDefaults = useSaveCheckoutDefaults(userId);
  const fund = useFundDeal(deal?.conversationId ?? '');
  const [shipTo, setShipTo] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [saveAddress, setSaveAddress] = useState(true);
  const [savePayment, setSavePayment] = useState(true);
  const [seeded, setSeeded] = useState(false);

  // Seed the form once per open from the saved defaults, then leave their edits alone.
  useEffect(() => {
    if (!visible) {
      setSeeded(false);
      return;
    }
    if (seeded || defaultsPending) return;
    setShipTo(defaults?.shipTo ?? EMPTY_SHIP_TO);
    setSaveAddress(!defaults?.shipTo);
    setSavePayment(!defaults?.paymentLabel);
    setSeeded(true);
  }, [visible, seeded, defaultsPending, defaults?.shipTo, defaults?.paymentLabel]);

  if (!deal) return null;

  const complete = shipToIsComplete(shipTo);
  const busy = fund.isPending || saveDefaults.isPending;
  const fee = estimatedFeeCents(deal);

  const pay = () => {
    if (!complete) return;
    const finish = () => {
      const patch: Parameters<typeof saveDefaults.mutate>[0] = {};
      if (saveAddress) patch.shipTo = shipTo;
      if (savePayment) patch.paymentLabel = TEST_PAYMENT_LABEL;
      // Saving defaults is a convenience; a failure must not undo a funded deal.
      if (Object.keys(patch).length > 0) saveDefaults.mutate(patch);
      onClose();
    };
    fund.mutate(
      { dealId: deal.id, shipTo, paymentLabel: TEST_PAYMENT_LABEL },
      { onSuccess: finish },
    );
  };

  return (
    <DealSheetShell visible={visible} title="Checkout" closeLabel="Close checkout" onClose={onClose}>
      <View style={styles.summary}>
        {listing ? (
          <Text style={styles.listingTitle} numberOfLines={2}>
            {listing.title}
          </Text>
        ) : null}
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Offer</Text>
          <Text style={styles.lineAmount}>{formatCents(deal.amountCents, deal.currency)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Shipping</Text>
          <Text style={styles.lineAmount}>Included</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabelStrong}>You pay</Text>
          <Text style={styles.lineAmountStrong}>
            {formatCents(deal.amountCents, deal.currency)}
          </Text>
        </View>
        <Text style={styles.note}>
          Held until you confirm receipt. The seller then receives{' '}
          {formatCents(deal.amountCents - fee, deal.currency)} after Graham&apos;s 5% commission.
        </Text>
      </View>

      <View style={styles.section}>
        <Eyebrow>Ship to</Eyebrow>
        <ShippingAddressFields value={shipTo} onChange={setShipTo} disabled={busy} />
        <SaveToggle
          label="Save this address to my profile"
          value={saveAddress}
          onChange={setSaveAddress}
          disabled={busy}
        />
      </View>

      <View style={styles.section}>
        <Eyebrow>Payment</Eyebrow>
        <View style={styles.payment}>
          <Text style={styles.paymentLabel}>{defaults?.paymentLabel ?? TEST_PAYMENT_LABEL}</Text>
          <Text style={styles.paymentNote}>Test mode. No card is charged.</Text>
        </View>
        <SaveToggle
          label="Save this payment method for next time"
          value={savePayment}
          onChange={setSavePayment}
          disabled={busy}
        />
      </View>

      {fund.error ? <Message text={fund.error.message} tone="error" /> : null}

      <View style={dealSheetActionStyles.actions}>
        <SocialButton
          label={`Pay ${formatCents(deal.amountCents, deal.currency)} (test)`}
          solid
          block
          busy={busy}
          disabled={!complete}
          onPress={pay}
        />
        <SocialButton label="Not now" block disabled={busy} onPress={onClose} />
      </View>
    </DealSheetShell>
  );
}

const checkoutStyles = (theme: Theme) => ({
  summary: {
    gap: stack.tight,
  },
  section: {
    gap: stack.related,
    paddingTop: space.sm,
  },
  listingTitle: {
    ...type.title,
    color: theme.color.text,
  },
  line: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: space.md,
  },
  lineLabel: {
    ...type.body,
    color: theme.color.text,
  },
  lineAmount: {
    ...type.body,
    color: theme.color.money,
  },
  lineLabelStrong: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  lineAmountStrong: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  note: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  payment: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.color.fill,
    gap: stack.tight,
  },
  paymentLabel: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  paymentNote: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
