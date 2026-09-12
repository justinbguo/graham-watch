import { Text, View } from 'react-native';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
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

/** Full card width: the dealer sits up beside the maker, in its own outline. */
function CardSummary({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.summary}>
      <View style={styles.makerRow}>
        <Text style={styles.brand} numberOfLines={1}>
          {card.brand}
        </Text>
        {card.dealer ? (
          <View style={styles.dealerBadge}>
            <Text style={styles.dealerName} numberOfLines={1}>
              {card.dealer.name}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.model} numberOfLines={1}>
        {card.model ?? 'Unknown model'}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {formatSpecs(card)}
      </Text>
      <Text style={styles.price}>{formatPrice(card)}</Text>
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
      <Text style={styles.brandTile}>{card.brand}</Text>
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
  makerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
  },
  brand: {
    ...type.labelStrong,
    color: theme.color.textMuted,
  },
  brandTile: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  // An outline rather than a fill: the details bar directly above is already a
  // solid strip, and two filled blocks stacked read as one control.
  dealerBadge: {
    flexShrink: 1,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
  },
  dealerName: {
    ...type.labelStrong,
    color: theme.color.brass,
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
  priceBlockTile: {
    gap: space.xs,
    paddingTop: space.sm,
  },
  price: {
    ...type.price,
    color: theme.color.text,
    paddingTop: space.sm,
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
