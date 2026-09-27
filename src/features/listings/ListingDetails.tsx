import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Divider } from '@/components/ui';
import { DealerPanel } from '@/features/dealers/DealerPanel';
import { humanize } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

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

      {card.description ? (
        <View style={styles.about}>
          <Text style={styles.aboutHeading}>About this watch</Text>
          <Text style={styles.description}>{card.description}</Text>
        </View>
      ) : null}

      <Divider />

      <View style={styles.specs}>
        {specs(card).map((spec) => (
          <Spec key={spec.label} {...spec} />
        ))}
      </View>

      {/* Above the dealer, not under them. Saving and asking are about the
          watch; the shop below is who you would be writing to. */}
      {actions ? <View style={styles.actions}>{actions}</View> : null}

      {card.dealer ? (
        <>
          <Divider />
          <DealerPanel dealer={card.dealer} browse />
        </>
      ) : null}
    </View>
  );
}

function Spec({ icon, label, value }: Spec) {
  const styles = useThemedStyles(detailsStyles);
  const theme = useTheme();

  return (
    // The word is gone from the row but not from the row's meaning, so it is
    // spoken: a screen reader hearing "1972" on its own learns nothing.
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.specRow}>
      <MaterialCommunityIcons name={icon} size={size.iconSmall} color={theme.color.text} />
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

/**
 * "Yes" said nothing once the word in front of it went away, so the fact
 * becomes its own sentence. Absent papers are worth saying out loud on a
 * vintage watch, so a false is printed rather than dropped.
 */
function has(thing: string, value: boolean | null) {
  if (value == null) return null;
  return value ? thing : `No ${thing.toLowerCase()}`;
}

type Spec = { icon: IconName; label: string; value: string };

/**
 * One line per fact: a glyph and the fact itself. The words that used to label
 * them — "Year", "Case", "Material" — were a column of type saying what the
 * value already said, and "1972" next to a calendar is not a puzzle.
 *
 * So the glyph carries the naming now, which is why each one is the literal
 * thing rather than a clever stand-in: a calendar for the year, a diameter for
 * the case, a cog for the caliber. Every row keeps its word for the screen
 * reader, and for two facts that cannot speak alone — box and papers — the
 * word *is* the value.
 *
 * Duplicates are dropped. A chronograph is often both the style and the only
 * complication, and the same word printed twice with two glyphs reads as a
 * mistake in the listing.
 */
function specs(card: DeckCard): Spec[] {
  const rows: [IconName, string, string | null][] = [
    ['identifier', 'Reference', card.reference],
    ['calendar-blank-outline', 'Year', card.year ? String(card.year) : null],
    ['diameter-variant', 'Case', card.case_size_mm ? `${card.case_size_mm}mm` : null],
    ['palette-swatch-outline', 'Material', card.case_material ? humanize(card.case_material) : null],
    ['circle-outline', 'Dial', card.dial_color ? humanize(card.dial_color) : null],
    ['autorenew', 'Winding', card.winding ? humanize(card.winding) : null],
    ['cog-outline', 'Caliber', card.caliber],
    ['tag-outline', 'Style', card.style ? humanize(card.style) : null],
    [
      'timer-outline',
      'Complications',
      card.complications.length ? card.complications.map(humanize).join(', ') : null,
    ],
    ['shield-check-outline', 'Condition', card.condition],
    ['package-variant-closed', 'Box', has('Box', card.has_box)],
    ['file-document-outline', 'Papers', has('Papers', card.has_papers)],
  ];

  const seen = new Set<string>();
  return rows
    .filter((row): row is [IconName, string, string] => Boolean(row[2]))
    .filter(([, , value]) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map(([icon, label, value]) => ({ icon, label, value }));
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
  // One body size for everything under the photograph. The description used
  // to be `body` over specs at `label`, which made the dealer's sentence the
  // loudest thing on a card whose facts are the reason to read it.
  description: {
    ...type.label,
    color: theme.color.text,
  },
  about: {
    gap: space.sm,
  },
  aboutHeading: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  specs: {
    // A row is a glyph tall, so this cannot go below `sm` without the lines
    // touching.
    gap: space.sm,
  },
  specRow: {
    flexDirection: 'row' as const,
    // Centred rather than on the baseline: a glyph has no baseline to share,
    // and sitting it on one hangs it below the word it belongs to.
    alignItems: 'center' as const,
    gap: space.sm,
  },
  specValue: {
    ...type.labelStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
  actions: {
    gap: stack.related,
  },
});
