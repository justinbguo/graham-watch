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
import type { DeckCard } from '@/lib/models';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
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

      <Divider />

      <SpecGroup title="Specifications" rows={specifications(card)} />
      <SpecGroup title="Condition" rows={condition(card)} />

      {/* Above the dealer, not under them. Saving and asking are about the
          watch; the shop below is who you would be writing to. */}
      {actions ? <View style={styles.actions}>{actions}</View> : null}

      {card.dealer ? (
        <>
          <Divider />
          <DealerPanel dealer={card.dealer} browse except={card.id} />
        </>
      ) : null}
    </View>
  );
}

function SpecGroup({ title, rows }: { title: string; rows: Spec[] }) {
  const styles = useThemedStyles(detailsStyles);
  if (rows.length === 0) return null;

  return (
    <View style={styles.group}>
      <Text style={styles.heading}>{title}</Text>
      {rows.map((spec) => (
        <Spec key={spec.label} {...spec} />
      ))}
    </View>
  );
}

function Spec({ label, value }: Spec) {
  const styles = useThemedStyles(detailsStyles);

  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.specRow}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue}>{value}</Text>
    </View>
  );
}

type Spec = { label: string; value: string };

/**
 * The year stays in the name. Reference, condition, and box and papers stay
 * even when the dealer never wrote them: a blank there is the thing a buyer
 * is checking for, and hiding the row makes silence look like a complete listing.
 *
 * Case and movement each join the two facts that answer one question. Style
 * "other" says the extractor gave up, so it is not printed.
 */
function specifications(card: DeckCard): Spec[] {
  const rows: Spec[] = [{ label: 'Reference', value: formatStated(card.reference) }];
  const caseValue = formatCase(card);
  if (caseValue) rows.push({ label: 'Case', value: caseValue });
  const movement = formatMovement(card);
  if (movement) rows.push({ label: 'Movement', value: movement });
  if (card.dial_color) rows.push({ label: 'Dial', value: humanize(card.dial_color) });
  const complications = formatComplications(card);
  if (complications) rows.push({ label: 'Complications', value: complications });
  if (card.style && card.style !== 'other') rows.push({ label: 'Style', value: humanize(card.style) });
  return rows;
}

function condition(card: DeckCard): Spec[] {
  return [
    { label: 'Condition', value: formatStated(card.condition) },
    { label: 'Box and papers', value: formatBoxAndPapers(card.has_box, card.has_papers) },
  ];
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
  heading: {
    ...type.title,
    color: theme.color.text,
  },
  group: {
    gap: space.sm,
  },
  specRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
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
  },
  actions: {
    gap: stack.related,
  },
});
