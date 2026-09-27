import { Text, View } from 'react-native';

import { formatPrice, formatSpecs, formatTitle } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Beside the photograph on a grid row: the name, its spec line, then the price
 * and the dealer. The name stops at two lines. One watch fills the row, so a
 * short name does not reserve a blank line under it.
 *
 * A swipe card does not use this. Its photograph carries the same three facts
 * over the image, where a card that fills the screen can afford them.
 */
export function ListingSummary({
  card,
  titleInset = 0,
}: {
  card: DeckCard;
  /**
   * Room kept clear at the end of the title, for a control in the row's
   * corner. The title is the line with slack — it wraps to two anyway — and
   * the price and the dealer have to stay whole on one.
   */
  titleInset?: number;
}) {
  const styles = useThemedStyles(summaryStyles);

  return (
    <View style={styles.summary}>
      <Text style={[styles.title, titleInset > 0 && { paddingRight: titleInset }]} numberOfLines={2}>
        {formatTitle(card)}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {formatSpecs(card)}
      </Text>

      {/* One line, as on the card: the price and the dealer divided by a
          middot. Stacked, they were a third and fourth line in a row that is
          only as tall as its photograph. One space either side of the middot,
          not the card's two — this line has a glyph at the end of it and the
          dealer's name was arriving truncated by five pixels. */}
      <Text style={styles.terms} numberOfLines={1}>
        {/* Sold replaces the price rather than sitting beside it. A number next
            to "Sold" reads as what it is going for, not what it went for. */}
        <Text style={card.sold_at ? styles.sold : styles.price}>
          {card.sold_at ? 'Sold' : formatPrice(card)}
        </Text>
        {card.dealer ? (
          <>
            {' · '}
            <Text style={styles.dealer}>{card.dealer.name}</Text>
          </>
        ) : null}
      </Text>
    </View>
  );
}

const summaryStyles = (theme: Theme) => ({
  summary: {
    padding: space.md,
    gap: space.xs,
  },
  title: {
    ...type.titleSmall,
    color: theme.color.text,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  terms: {
    ...type.caption,
    color: theme.color.textFaint,
    paddingTop: space.sm,
  },
  price: {
    ...type.priceSmall,
    color: theme.color.text,
  },
  sold: {
    ...type.priceSmall,
    color: theme.color.textFaint,
  },
  // Brass type, not an outlined badge: a badge is a control, and a dealer's
  // name is not something you press.
  dealer: {
    ...type.caption,
    color: theme.color.brass,
  },
});
