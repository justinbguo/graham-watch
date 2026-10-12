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
  dense = false,
  compact = false,
  note,
  notedAt,
  prompt = false,
}: {
  card: DeckCard;
  /** The home grid. Less padding, so the row is only as tall as a short photo. */
  dense?: boolean;
  /**
   * The wishlist. The name a step smaller and no spec line: a watch you
   * already saved is recognised by its name and price, and the reference is
   * one tap away on the listing.
   */
  compact?: boolean;
  /** Between the name and the price. A last message, or the prompt to write one. */
  note?: string;
  /** The day that message was sent, at the top right of the name. */
  notedAt?: string;
  /** The note is the prompt, not a message someone already sent. */
  prompt?: boolean;
}) {
  const styles = useThemedStyles(summaryStyles);
  const title = (
    <View style={styles.titleLine}>
      <Text style={[compact ? styles.titleCompact : styles.title, styles.titleFlex]} numberOfLines={2}>
        {formatTitle(card)}
      </Text>
      {notedAt ? <Text style={styles.when}>{notedAt}</Text> : null}
    </View>
  );
  const terms = (
    <Text style={[styles.terms, (dense || compact) && styles.termsDense]} numberOfLines={1}>
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
  );

  return (
    <View style={compact ? styles.summaryCompact : dense ? styles.summaryDense : styles.summary}>
      {title}
      {compact ? null : (
        <Text style={styles.meta} numberOfLines={1}>
          {formatSpecs(card)}
        </Text>
      )}
      {note ? (
        <Text style={prompt ? styles.prompt : styles.note} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
      {terms}
    </View>
  );
}

const summaryStyles = (theme: Theme) => ({
  summary: {
    padding: space.md,
    gap: space.xs,
  },
  // Vertical stays `sm`, so the row is still only as tall as the photo.
  // The left is `md`: at `sm` the name sat on the photograph.
  summaryDense: {
    paddingVertical: space.sm,
    paddingRight: space.sm,
    paddingLeft: space.md,
    gap: space.xs,
  },
  // The row's own padding holds the vertical air. Only the gap to the photo.
  summaryCompact: {
    paddingLeft: space.md,
    paddingRight: space.sm,
    gap: space.xs,
  },
  title: {
    ...type.titleSmall,
    color: theme.color.text,
  },
  titleCompact: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  titleLine: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
  },
  titleFlex: {
    flex: 1,
    minWidth: 0,
  },
  when: {
    ...type.caption,
    color: theme.color.textMuted,
    flexShrink: 0,
  },
  note: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  prompt: {
    ...type.caption,
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
  termsDense: {
    paddingTop: space.xs,
  },
  price: {
    ...type.priceSmall,
    color: theme.color.text,
  },
  sold: {
    ...type.priceSmall,
    color: theme.color.textFaint,
  },
  // Medium is this face's semibold: there is no 600 cut. Brass, not a badge.
  // A dealer's name is not something you press.
  dealer: {
    ...type.control,
    color: theme.color.brass,
  },
});
