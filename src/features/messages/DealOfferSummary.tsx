import { Text, View } from 'react-native';

import { formatCents } from '@/lib/money';
import { space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealListingDelta } from './DealListingDelta';

export function DealOfferSummary({
  cents,
  fee,
  net,
  listPriceCents,
  countering,
}: {
  cents: number;
  fee: number;
  net: number;
  listPriceCents?: number | null;
  countering: boolean;
}) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.block}>
      <DealListingDelta offerCents={cents} listPriceCents={listPriceCents} />
      <View style={styles.expenses}>
        <ExpenseLine label="Offer" amount={formatCents(cents)} />
        <ExpenseLine label="Graham commission (5%)" amount={formatCents(fee)} />
        <ExpenseLine
          label={countering ? 'Seller receives' : 'You receive'}
          amount={formatCents(net)}
          strong
        />
      </View>
    </View>
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

const summaryStyles = (_theme: Theme) => ({
  block: {
    gap: stack.tight,
    paddingTop: space.sm,
  },
  expenses: {
    gap: stack.tight,
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
