import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Divider } from '@/components/ui';
import { DealerPanel } from '@/features/dealers/DealerPanel';
import {
  formatBoxAndPapers,
  formatCase,
  formatComplications,
  formatMovement,
  formatStated,
  humanize,
} from '@/lib/format';
import type { BuyerEventSurface, DeckCard } from '@/lib/models';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Everything about a watch below its photograph: what the dealer wrote, who is
 * selling it, and what you can do about it.
 *
 * It reads the same in both frames it appears in — scrolled inside a deck card,
 * and on the listing route a saved watch opens — because the two are the same
 * act. Only the buttons differ, so the frame passes those in: on the deck a
 * right swipe is the save, and a Save button next to it would be a second way
 * to do one thing.
 */
function SpecTable({ card }: { card: DeckCard }) {
  const styles = useThemedStyles(detailsStyles);
  const facts = [
    { label: 'Reference', value: formatStated(card.reference) },
    formatCase(card) ? { label: 'Case', value: formatCase(card) } : null,
    formatMovement(card) ? { label: 'Movement', value: formatMovement(card) } : null,
    card.dial_color ? { label: 'Dial', value: humanize(card.dial_color) } : null,
    formatComplications(card)
      ? { label: 'Complications', value: formatComplications(card) }
      : null,
    card.style && card.style !== 'other' ? { label: 'Style', value: humanize(card.style) } : null,
  ].filter((row): row is { label: string; value: string } => row != null && row.value != null);

  return (
    <View style={styles.specGroup}>
      <Text style={styles.heading}>Specifications</Text>
      {facts.map((row) => (
        <SpecRow key={row.label} label={row.label} value={row.value} />
      ))}
      <Text style={styles.heading}>Condition</Text>
      <SpecRow label="Condition" value={formatStated(card.condition ? humanize(card.condition) : null)} />
      <SpecRow label="Box and papers" value={formatBoxAndPapers(card.has_box, card.has_papers)} />
    </View>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(detailsStyles);
  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

export function ListingDetails({
  card,
  actions,
  surface,
}: {
  card: DeckCard;
  actions?: ReactNode;
  /** The frame it is in, for the buyer event log. */
  surface: BuyerEventSurface;
}) {
  const styles = useThemedStyles(detailsStyles);

  return (
    <View style={styles.details}>
      {/* Only ever reached from the wishlist: the deck cannot serve a sold watch. It
          says what the dealer would have said, before an email gets written. */}
      {card.sold_at ? (
        <View style={styles.sold}>
          <Text style={styles.soldLabel}>Sold</Text>
          <Text style={styles.soldNote}>
            {card.dealer?.name ?? 'The dealer'} no longer has this watch.
          </Text>
        </View>
      ) : null}

      {card.description ? (
        <View style={styles.about}>
          <Text style={styles.heading}>About this watch</Text>
          <Text style={styles.description}>{card.description}</Text>
        </View>
      ) : null}

      <SpecTable card={card} />

      {/* Above the dealer. Pass and save are about the watch; the shop is below. */}
      {actions ? <View style={styles.actions}>{actions}</View> : null}

      {card.dealer ? (
        <>
          {card.sold_at || card.description || actions ? <Divider /> : null}
          <DealerPanel dealer={card.dealer} browse except={card.id} surface={surface} />
        </>
      ) : null}
    </View>
  );
}

const detailsStyles = (theme: Theme) => ({
  details: {
    // The card is read in the hand at arm's length, so its parts sit close.
    // `group` spacing belongs on a page, where the eye travels further.
    gap: stack.related,
  },
  sold: {
    gap: space.xs,
    padding: inset.card,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
  },
  soldLabel: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  soldNote: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  description: {
    ...type.label,
    color: theme.color.text,
  },
  about: {
    gap: space.sm,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
  specGroup: {
    gap: space.sm,
  },
  specRow: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  specLabel: {
    ...type.label,
    color: theme.color.text,
    width: size.specLabel,
  },
  specValue: {
    ...type.labelStrong,
    color: theme.color.text,
    flex: 1,
    minWidth: 0,
  },
  actions: {
    gap: stack.related,
  },
});
