import { Text, View } from 'react-native';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * What a watch says about itself at a glance, on the card and in the grid tile.
 * Four lines in a fixed order — maker, model, specs, price — so the eye lands in
 * the same place on every watch and comparing two is a matter of looking twice.
 *
 * A tile column is half a phone wide. It keeps the order and drops a step in the
 * type scale, and nothing in it is clamped to one line: a name cut to "Oyster-
 * Perpetual…" or a price sitting on top of a dealer answer neither question.
 */
export function ListingSummary({
  card,
  variant = 'card',
}: {
  card: DeckCard;
  variant?: 'card' | 'tile';
}) {
  const styles = useThemedStyles(summaryStyles);
  const tile = variant === 'tile';
  const clamp = tile ? undefined : 1;

  return (
    <View style={tile ? styles.summaryTile : styles.summary}>
      <Text style={styles.brand} numberOfLines={clamp}>
        {card.brand}
      </Text>
      <Text style={tile ? styles.modelTile : styles.model} numberOfLines={clamp}>
        {card.model ?? 'Unknown model'}
      </Text>
      <Text style={styles.meta} numberOfLines={clamp}>
        {formatSpecs(card)}
      </Text>

      <View style={tile ? styles.priceBlockTile : styles.priceRow}>
        <Text style={tile ? styles.priceTile : styles.price}>{formatPrice(card)}</Text>
        {card.dealer ? (
          <Text style={tile ? styles.dealerTile : styles.dealer} numberOfLines={clamp}>
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
  summaryTile: {
    padding: space.md,
    gap: space.xs,
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
  modelTile: {
    ...type.titleSmall,
    color: theme.color.text,
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
  // Stacked, not side by side. Two wrapping texts sharing a row make ragged
  // columns of one word each, and the price stops being findable.
  priceBlockTile: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  price: {
    ...type.price,
    color: theme.color.text,
  },
  priceTile: {
    ...type.priceSmall,
    color: theme.color.text,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  dealerTile: {
    ...type.caption,
    color: theme.color.brass,
  },
});
