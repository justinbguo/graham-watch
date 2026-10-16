import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { MessageListing } from '@/data/messages';
import { motion, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ListingQuote } from './ListingQuote';

/**
 * The one you just sent rises out of the composer into the thread. A reply
 * that lands on the poll simply appears: you did not cause it, and a flight
 * on someone else's message would look performed.
 */
const rise = FadeInDown.duration(motion.base).withInitialValues({
  transform: [{ translateY: space.lg }],
});

/**
 * One message. Yours on the right in the accent, theirs on the left in the
 * fill — the two sides have to be told apart at a glance, and alignment alone
 * fails as soon as one message wraps to the width of the column.
 */
export function Bubble({
  body,
  mine,
  /** The watch this message answers. Sits above the words. */
  listing,
  onOpenListing,
  /** How it left, when that is not obvious: "Sent by email". */
  caption,
  when,
  sent = false,
  speaker,
}: {
  body: string;
  mine: boolean;
  listing?: MessageListing | null;
  onOpenListing?: () => void;
  caption?: string | null;
  when?: string | null;
  /** Just sent from this screen, so it arrives rather than being there. */
  sent?: boolean;
  /** Who said this, above the first bubble of their run in a group. */
  speaker?: string | null;
}) {
  const styles = useThemedStyles(bubbleStyles);

  return (
    <Animated.View entering={sent ? rise : undefined} style={[styles.row, mine && styles.rowMine]}>
      {listing && onOpenListing ? (
        <ListingQuote listing={listing} onPress={onOpenListing} mine={mine} />
      ) : null}
      {speaker ? <Text style={styles.speaker}>{speaker}</Text> : null}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {caption ? (
          <Text style={[styles.caption, mine && styles.captionMine]}>{caption}</Text>
        ) : null}
        <Text style={[styles.body, mine && styles.bodyMine]}>{body}</Text>
      </View>
      {when ? <Text style={styles.when}>{when}</Text> : null}
    </Animated.View>
  );
}

const bubbleStyles = (theme: Theme) => ({
  row: {
    alignItems: 'flex-start' as const,
    gap: stack.tight,
  },
  rowMine: {
    alignItems: 'flex-end' as const,
  },
  bubble: {
    // Never the full column: a bubble that reaches both edges stops reading
    // as something one person said.
    maxWidth: '82%' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    gap: stack.tight,
  },
  mine: {
    backgroundColor: theme.color.accent,
  },
  theirs: {
    backgroundColor: theme.color.fill,
  },
  body: {
    ...type.body,
    color: theme.color.text,
  },
  bodyMine: {
    color: theme.color.onAccent,
  },
  caption: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  captionMine: {
    color: theme.color.onAccent,
    opacity: 0.7,
  },
  when: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  speaker: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
