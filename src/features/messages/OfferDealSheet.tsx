import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckRow } from '@/components/CheckRow';
import { Button, Field, Message } from '@/components/ui';
import { useCreateDeal } from '@/data/deals';
import { feeCentsFromBps, formatCents, parseDollarsToCents } from '@/lib/money';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function OfferDealSheet({
  visible,
  conversationId,
  listingId,
  allowSell,
  allowBuy,
  onClose,
}: {
  visible: boolean;
  conversationId: string;
  listingId?: string | null;
  allowSell: boolean;
  allowBuy: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(sheetStyles);
  const create = useCreateDeal(conversationId);
  const [amount, setAmount] = useState('');
  const [role, setRole] = useState<'sell' | 'buy'>(allowSell ? 'sell' : 'buy');

  const cents = parseDollarsToCents(amount);
  const fee = cents ? feeCentsFromBps(cents, 500) : null;

  const submit = () => {
    if (!cents) return;
    const proposerIsSeller = role === 'sell';
    create.mutate(
      { amountCents: cents, proposerIsSeller, listingId },
      {
        onSuccess: () => {
          setAmount('');
          onClose();
        },
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + inset.screen }]}>
        <Text style={styles.heading}>Offer a deal</Text>
        <Message
          text="Name a price. The buyer pays into the deal with Apple Pay when that ships; Graham takes a fee at settlement."
        />
        {allowSell ? (
          <CheckRow
            label="I am offering to sell"
            selected={role === 'sell'}
            onPress={() => setRole('sell')}
          />
        ) : null}
        {allowBuy ? (
          <CheckRow
            label="I am offering to buy"
            selected={role === 'buy'}
            onPress={() => setRole('buy')}
          />
        ) : null}
        <Text style={styles.fieldLabel}>Amount (USD)</Text>
        <Field
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="12500"
        />
        {fee !== null && cents ? (
          <Text style={styles.fee}>
            Estimated Graham fee (5%): {formatCents(fee)}
          </Text>
        ) : null}
        {create.error ? <Message text={create.error.message} tone="error" /> : null}
        <View style={styles.actions}>
          <Button label="Send offer" loading={create.isPending} disabled={!cents} onPress={submit} />
          <Button label="Cancel" variant="ghost" disabled={create.isPending} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = (theme: Theme) => ({
  scrim: {
    flex: 1,
    backgroundColor: theme.color.overlay,
  },
  sheet: {
    backgroundColor: theme.color.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: inset.screen,
    paddingTop: space.lg,
    gap: stack.related,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
  fieldLabel: {
    ...type.label,
    color: theme.color.textMuted,
  },
  fee: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  actions: {
    gap: space.sm,
  },
});
