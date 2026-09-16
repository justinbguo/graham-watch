import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Divider } from '@/components/ui';
import { DealerPanel } from '@/features/dealers/DealerPanel';
import { humanize } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Everything about a watch below its price: what the dealer wrote, the
 * specification table, who is selling it, and what you can do about it.
 *
 * It reads the same in both frames it appears in — scrolled inside a deck card,
 * and on the listing route a saved watch opens — because the two are the same
 * act. Only the buttons differ, so the frame passes those in: on the deck a
 * right swipe is the save, and a Save button next to it would be a second way
 * to do one thing.
 */
export function ListingDetails({ card, actions }: { card: DeckCard; actions?: ReactNode }) {
  const styles = useThemedStyles(detailsStyles);

  return (
    <View style={styles.details}>
      {/* Only ever reached from Saved: the deck cannot serve a sold watch. It
          says what the dealer would have said, before an email gets written. */}
      {card.sold_at ? (
        <View style={styles.sold}>
          <Text style={styles.soldLabel}>Sold</Text>
          <Text style={styles.soldNote}>
            {card.dealer?.name ?? 'The dealer'} no longer has this watch.
          </Text>
        </View>
      ) : null}

      {card.description ? <Text style={styles.description}>{card.description}</Text> : null}

      <Divider />

      <View style={styles.specs}>
        {specs(card).map(([label, value]) => (
          <Spec key={label} label={label} value={value} />
        ))}
      </View>

      {card.dealer ? (
        <>
          <Divider />
          <DealerPanel dealer={card.dealer} />
        </>
      ) : null}

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(detailsStyles);

  return (
    <View style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

function yesNo(value: boolean | null) {
  if (value == null) return null;
  return value ? 'Yes' : 'No';
}

function specs(card: DeckCard): [string, string][] {
  const rows: [string, string | null][] = [
    ['Reference', card.reference],
    ['Year', card.year ? String(card.year) : null],
    ['Case', card.case_size_mm ? `${card.case_size_mm}mm` : null],
    ['Material', card.case_material ? humanize(card.case_material) : null],
    ['Dial', card.dial_color ? humanize(card.dial_color) : null],
    ['Winding', card.winding ? humanize(card.winding) : null],
    ['Caliber', card.caliber],
    ['Style', card.style ? humanize(card.style) : null],
    [
      'Complications',
      card.complications.length ? card.complications.map(humanize).join(', ') : null,
    ],
    ['Condition', card.condition],
    ['Box', yesNo(card.has_box)],
    ['Papers', yesNo(card.has_papers)],
  ];

  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

const detailsStyles = (theme: Theme) => ({
  details: {
    gap: stack.group,
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
    ...type.body,
    color: theme.color.textMuted,
  },
  specs: {
    gap: space.sm,
  },
  specRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  specLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  specValue: {
    ...type.label,
    color: theme.color.text,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  actions: {
    gap: stack.related,
  },
});
