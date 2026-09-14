import { Text, View } from 'react-native';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * What a watch says about itself at a glance. Both variants keep one order —
 * maker, model, specs, price — so the eye lands in the same place on every watch
 * and comparing two is a matter of looking twice. They differ in where the
 * dealer goes and how much room a line gets, which is why they are written out
 * rather than assembled from conditionals.
 */
export function ListingSummary({
  card,
  variant = 'card',
}: {
  card: DeckCard;
  variant?: 'card' | 'tile';
}) {
  return variant === 'tile' ? <TileSummary card={card} /> : <CardSummary card={card} />;
}

/**
 * Full card width, set like a catalogue entry: maker, watch, specification,
 * then a rule, then what it costs and who from. The rule is the whole point of
 * the block — it separates the description from the transaction, so the eye
 * reads the watch first and lands on the price as a conclusion.
 */
function CardSummary({ card }: { card: DeckCard }) {
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
          <Text style={styles.dealerName} numberOfLines={1}>
            {card.dealer.name}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Half a phone wide. A step down the type scale, the dealer back under the
 * price, and nothing clamped to one line: a name cut to "Oyster-Perpetual…" and
 * a price squeezed beside a dealer both answer a question nobody asked.
 */
function TileSummary({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.summaryTile}>
      <Text style={styles.brand}>{card.brand}</Text>
      <Text style={styles.modelTile}>{card.model ?? 'Unknown model'}</Text>
      <Text style={styles.meta}>{formatSpecs(card)}</Text>

      <View style={styles.priceBlockTile}>
        <Text style={styles.priceTile}>{formatPrice(card)}</Text>
        {card.dealer ? <Text style={styles.dealerTile}>{card.dealer.name}</Text> : null}
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
  // On the price baseline rather than in an outline beside the maker. A badge
  // is a control, and the dealer's name is not something you press.
  dealerName: {
    ...type.labelStrong,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  model: {
    ...type.title,
    color: theme.color.text,
  },
  modelTile: {
    ...type.titleSmall,
    color: theme.color.text,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  priceBlockTile: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    marginTop: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  price: {
    ...type.price,
    color: theme.color.text,
  },
  priceTile: {
    ...type.priceSmall,
    color: theme.color.text,
  },
  dealerTile: {
    ...type.caption,
    color: theme.color.brass,
  },
});
