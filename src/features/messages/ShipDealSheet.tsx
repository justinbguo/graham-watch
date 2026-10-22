import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SegmentedChoice } from '@/components/SegmentedChoice';
import { Eyebrow, Field, Message } from '@/components/ui';
import { formatShipTo } from '@/data/checkout';
import { useShipDeal, type ConversationDeal } from '@/data/deals';
import { formatShortDate } from '@/lib/format';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealSheetShell, dealSheetActionStyles } from './DealSheetShell';
import { SocialButton } from '@/components/SocialButton';

const CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Other'] as const;
type Carrier = (typeof CARRIERS)[number];
const CARRIER_OPTIONS = CARRIERS.map((carrier) => ({ value: carrier, label: carrier }));

/**
 * Seller enters the tracking from a label they bought themselves. Graham does
 * not buy labels: insured, signature-required shipping on a watch is a choice
 * the seller should make with their own carrier account.
 */
export function ShipDealSheet({
  visible,
  deal,
  onClose,
}: {
  visible: boolean;
  deal: ConversationDeal | null;
  onClose: () => void;
}) {
  const styles = useThemedStyles(shipStyles);
  const ship = useShipDeal(deal?.conversationId ?? '');
  const [carrier, setCarrier] = useState<Carrier>('UPS');
  const [otherCarrier, setOtherCarrier] = useState('');
  const [tracking, setTracking] = useState('');

  useEffect(() => {
    if (visible) return;
    setCarrier('UPS');
    setOtherCarrier('');
    setTracking('');
  }, [visible]);

  if (!deal) return null;

  const carrierName = carrier === 'Other' ? otherCarrier.trim() : carrier;
  const trackingNumber = tracking.trim();
  const ready = carrierName.length > 0 && trackingNumber.length >= 6;

  const submit = () => {
    if (!ready) return;
    ship.mutate(
      { dealId: deal.id, carrier: carrierName, trackingNumber },
      { onSuccess: onClose },
    );
  };

  return (
    <DealSheetShell
      visible={visible}
      title="Mark as shipped"
      closeLabel="Close shipping sheet"
      onClose={onClose}>
      {deal.shipTo ? (
        <View style={styles.section}>
          <Eyebrow>Ship to</Eyebrow>
          <View style={styles.address}>
            <Text style={styles.addressText} selectable>
              {formatShipTo(deal.shipTo)}
            </Text>
            {deal.shipTo.phone ? (
              <Text style={styles.addressPhone} selectable>
                {deal.shipTo.phone}
              </Text>
            ) : null}
          </View>
          {deal.shipBy ? (
            <Text style={styles.note}>
              Ship by {formatShortDate(deal.shipBy)}. Use insured, signature-required service and
              keep the receipt.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Eyebrow>Carrier</Eyebrow>
        <SegmentedChoice
          label="Carrier"
          value={carrier}
          options={CARRIER_OPTIONS}
          onChange={setCarrier}
        />
        {carrier === 'Other' ? (
          <Field
            value={otherCarrier}
            onChangeText={setOtherCarrier}
            placeholder="Carrier name"
            autoCapitalize="words"
            maxLength={40}
            editable={!ship.isPending}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Eyebrow>Tracking number</Eyebrow>
        <Field
          value={tracking}
          onChangeText={setTracking}
          placeholder="From your label"
          autoCapitalize="characters"
          maxLength={80}
          editable={!ship.isPending}
        />
        <Text style={styles.note}>
          The buyer sees the carrier and number in this thread and confirms receipt when it arrives.
        </Text>
      </View>

      {ship.error ? <Message text={ship.error.message} tone="error" /> : null}

      <View style={dealSheetActionStyles.actions}>
        <SocialButton
          label="Mark shipped"
          solid
          block
          busy={ship.isPending}
          disabled={!ready}
          onPress={submit}
        />
        <SocialButton label="Cancel" block disabled={ship.isPending} onPress={onClose} />
      </View>
    </DealSheetShell>
  );
}

const shipStyles = (theme: Theme) => ({
  section: {
    gap: stack.related,
  },
  address: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.color.fill,
    gap: stack.tight,
  },
  addressText: {
    ...type.body,
    color: theme.color.text,
  },
  addressPhone: {
    ...type.body,
    color: theme.color.textMuted,
  },
  note: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
