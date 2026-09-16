import { Text, View } from 'react-native';

import { formatPrice, formatSpecs, formatTitle } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * What a watch says about itself at a glance. Both variants keep one order —
 * name, specs, price — so the eye lands in the same place on every watch and
 * comparing two is a matter of looking twice. They differ in where the name
 * is, how much room a line gets, and where the dealer goes, which is why they
 * are written out rather than assembled from conditionals.
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
 * Full card width, set like the plate under a catalogue photograph: what it
 * costs, and who from. Nothing else. The name is on the photograph above, and
 * the reference and case size are rows in the table further down the card —
 * printing either one twice in two inches reads as a template, not a page.
 */
function CardSummary({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.summary}>
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
 * Half a phone wide, and the dealer back under the price. The name is one line
 * of one size, held to two lines of height whether it needs them or not: tiles
 * sit two to a row, and a name that wraps where its neighbour does not leaves
 * the row stepping. A cut name is a smaller loss than a ragged grid.
 */
function TileSummary({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.summaryTile}>
      <Text style={styles.titleTile} numberOfLines={2}>
        {formatTitle(card)}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {formatSpecs(card)}
      </Text>

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
  // On the price baseline rather than in an outline beside the maker. A badge
  // is a control, and the dealer's name is not something you press.
  dealerName: {
    ...type.labelStrong,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  titleTile: {
    ...type.titleSmall,
    color: theme.color.text,
    height: type.titleSmall.lineHeight * 2,
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
