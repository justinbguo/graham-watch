import { Text, View } from 'react-native';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * What a watch says about itself at a glance, on the card and in the grid tile.
 * Four lines in a fixed order — maker, model, specs, price — so the eye lands in
 * the same place on every watch and comparing two is a matter of looking twice.
 */
export function ListingSummary({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.summary}>
      <Text style={styles.brand} numberOfLines={1}>
        {card.brand}
      </Text>
      <Text style={styles.model} numberOfLines={1}>
        {card.model ?? 'Unknown model'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {formatSpecs(card)}
      </Text>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(card)}</Text>
        {card.dealer ? (
          <Text style={styles.dealer} numberOfLines={1}>
            {card.dealer.name}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const summaryStyles = (theme: Theme) => ({
  summary: {
    padding: inset.card,
    gap: stack.tight,
  },
  brand: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  model: {
    ...type.title,
    color: theme.color.text,
    paddingTop: space.xs,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    paddingTop: space.sm,
  },
  price: {
    ...type.price,
    color: theme.color.text,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
});
