import { Text, View } from 'react-native';

import { radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * One message. Yours on the right in the accent, theirs on the left in the
 * fill — the two sides have to be told apart at a glance, and alignment alone
 * fails as soon as one message wraps to the width of the column.
 */
export function Bubble({
  body,
  mine,
  /** What this message was about, or how it left: "About a Rolex", "Sent by email". */
  caption,
  when,
}: {
  body: string;
  mine: boolean;
  caption?: string | null;
  when?: string | null;
}) {
  const styles = useThemedStyles(bubbleStyles);

  return (
    <View style={[styles.row, mine && styles.rowMine]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {caption ? (
          <Text style={[styles.caption, mine && styles.captionMine]}>{caption}</Text>
        ) : null}
        <Text style={[styles.body, mine && styles.bodyMine]}>{body}</Text>
      </View>
      {when ? <Text style={styles.when}>{when}</Text> : null}
    </View>
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
});
