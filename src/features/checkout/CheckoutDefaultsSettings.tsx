import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { SocialButton } from '@/components/SocialButton';
import { Message } from '@/components/ui';
import {
  EMPTY_SHIP_TO,
  formatShipTo,
  shipToIsComplete,
  useCheckoutDefaults,
  useSaveCheckoutDefaults,
  type ShipTo,
} from '@/data/checkout';
import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { ShippingAddressFields } from './ShippingAddressFields';

/** Settings block: the saved ship-to and payment stand-in used to prefill checkout. */
export function CheckoutDefaultsSettings() {
  const { userId } = useSession();
  const styles = useThemedStyles(defaultsStyles);
  const { data, isPending, error } = useCheckoutDefaults(userId);
  const save = useSaveCheckoutDefaults(userId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ShipTo>(EMPTY_SHIP_TO);

  useEffect(() => {
    if (editing) setDraft(data?.shipTo ?? EMPTY_SHIP_TO);
  }, [editing, data?.shipTo]);

  if (!userId) return <Message text="Sign in to save checkout details." />;
  if (isPending) return <Message text="Loading…" />;
  if (error) return <Message text={error.message} tone="error" />;

  if (editing) {
    return (
      <View style={styles.block}>
        <ShippingAddressFields value={draft} onChange={setDraft} disabled={save.isPending} />
        {save.error ? <Message text={save.error.message} tone="error" /> : null}
        <View style={styles.row}>
          <SocialButton
            label="Save address"
            solid
            rowItem
            busy={save.isPending}
            disabled={!shipToIsComplete(draft)}
            onPress={() => save.mutate({ shipTo: draft }, { onSuccess: () => setEditing(false) })}
          />
          <SocialButton
            label="Cancel"
            rowItem
            disabled={save.isPending}
            onPress={() => setEditing(false)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Shipping address</Text>
        {data?.shipTo ? (
          <Text style={styles.cardBody}>{formatShipTo(data.shipTo)}</Text>
        ) : (
          <Text style={styles.cardMuted}>None saved. Checkout asks each time.</Text>
        )}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Payment method</Text>
        {data?.paymentLabel ? (
          <Text style={styles.cardBody}>{data.paymentLabel}</Text>
        ) : (
          <Text style={styles.cardMuted}>None saved.</Text>
        )}
        <Text style={styles.cardMuted}>Test mode. Real cards arrive with Stripe.</Text>
      </View>
      <View style={styles.row}>
        <SocialButton
          label={data?.shipTo ? 'Edit address' : 'Add address'}
          rowItem
          onPress={() => setEditing(true)}
        />
        {data?.paymentLabel ? (
          <SocialButton
            label="Remove payment"
            rowItem
            busy={save.isPending}
            onPress={() => save.mutate({ paymentLabel: null })}
          />
        ) : null}
      </View>
    </View>
  );
}

const defaultsStyles = (theme: Theme) => ({
  block: {
    gap: stack.related,
  },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: theme.color.fill,
    gap: stack.tight,
  },
  cardLabel: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  cardBody: {
    ...type.body,
    color: theme.color.text,
  },
  cardMuted: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  row: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
});
