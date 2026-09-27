import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import type { VoteValue } from '@/data/exchange';
import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * Both directions in one capsule, with the score between them, at the head of
 * the action bar. An upvote on its own could only say "worth answering"; the
 * score exists so a stranger can tell a fair offer from one the board has
 * seen before.
 *
 * Brass marks the arrow you pressed, either way. `danger` would read as
 * "delete" — in this app red means destroy, not disagree — and colouring the
 * two arrows differently would say a downvote is a different kind of act.
 */
export function Votes({
  score,
  mine,
  onVote,
}: {
  score: number;
  /** Which way this person voted, or 0. */
  mine: VoteValue;
  /** The vote after the press: 0 when the same arrow is pressed twice. */
  onVote: (value: VoteValue) => void;
}) {
  const styles = useThemedStyles(voteStyles);
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Arrow
        direction={1}
        mine={mine}
        score={score}
        color={mine === 1 ? theme.color.brass : theme.color.textMuted}
        onVote={onVote}
      />
      <Text style={[styles.score, mine !== 0 && styles.scoreOn]}>{score}</Text>
      <Arrow
        direction={-1}
        mine={mine}
        score={score}
        color={mine === -1 ? theme.color.brass : theme.color.textMuted}
        onVote={onVote}
      />
    </View>
  );
}

function Arrow({
  direction,
  mine,
  score,
  color,
  onVote,
}: {
  direction: 1 | -1;
  mine: VoteValue;
  score: number;
  color: string;
  onVote: (value: VoteValue) => void;
}) {
  const styles = useThemedStyles(voteStyles);
  const chosen = mine === direction;
  const word = direction === 1 ? 'Upvote' : 'Downvote';
  const glyph = direction === 1 ? UP[chosen ? 'on' : 'off'] : DOWN[chosen ? 'on' : 'off'];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={
        chosen
          ? `Take back your ${word.toLowerCase()}. Score ${score}`
          : `${word}. Score ${score}`
      }
      hitSlop={space.sm}
      onPress={() => onVote(chosen ? 0 : direction)}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={glyph} size={size.icon} color={color} />
    </Pressable>
  );
}

/** Solid when it is your vote, outlined when it is not. */
const UP = { on: 'arrow-up-bold', off: 'arrow-up-bold-outline' } as const;
const DOWN = { on: 'arrow-down-bold', off: 'arrow-down-bold-outline' } as const;

const voteStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    alignSelf: 'flex-start' as const,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    // The first capsule in the action bar, filled like the rest of them.
    backgroundColor: theme.color.fill,
  },
  arrow: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  score: {
    ...type.bodyStrong,
    color: theme.color.textMuted,
    // Two digits and a minus sign without the arrows shifting as the score
    // changes under a press.
    minWidth: space.xl,
    textAlign: 'center' as const,
  },
  scoreOn: {
    color: theme.color.brass,
  },
  pressed: {
    opacity: 0.6,
  },
});
