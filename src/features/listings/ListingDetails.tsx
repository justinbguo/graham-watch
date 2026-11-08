import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Divider } from '@/components/ui';
import { DealerPanel } from '@/features/dealers/DealerPanel';
import type { DeckCard } from '@/lib/models';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
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

      {/* Above the dealer. Pass and save are about the watch; the shop is below. */}
      {actions ? <View style={styles.actions}>{actions}</View> : null}

      {card.dealer ? (
        <>
          {card.sold_at || card.description || actions ? <Divider /> : null}
          <DealerPanel dealer={card.dealer} browse except={card.id} />
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
  actions: {
    gap: stack.related,
  },
});
