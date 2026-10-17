import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ACTION_BAR_ICON, PILL_HIT_SLOP } from '@/components/ActionBar';
import type { VoteValue } from '@/data/exchange';
import { HIT_TARGET, motion, radius, space, type, type Theme } from '@/lib/theme';
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
 *
 * A press moves. The arrow nudges the way it points and comes back, and the
 * score steps one digit in the direction it changed, the way a counter rolls.
 * Taking a vote back nudges the other way. Brass already says the vote is
 * yours, so the motion stays in the arrow and the number.
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
        color={mine === 1 ? theme.color.brass : theme.color.ink}
        onVote={onVote}
      />
      <Score score={score} on={mine !== 0} />
      <Arrow
        direction={-1}
        mine={mine}
        score={score}
        color={mine === -1 ? theme.color.brass : theme.color.ink}
        onVote={onVote}
      />
    </View>
  );
}

/** How far the arrow travels on a press, and the score on a change. */
const STEP = space.xs;

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
  const glyph = direction === 1 ? 'arrow-up' : 'arrow-down';

  const nudge = useSharedValue(0);
  const nudgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: nudge.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      accessibilityLabel={
        chosen
          ? `Take back your ${word.toLowerCase()}. Score ${score}`
          : `${word}. Score ${score}`
      }
      hitSlop={PILL_HIT_SLOP}
      onPress={() => {
        // Up is negative on screen. Taking the vote back goes the other way.
        const toward = chosen ? direction : -direction;
        nudge.value = withSequence(
          withTiming(toward * STEP, { duration: motion.fast / 2, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: motion.fast / 2, easing: Easing.out(Easing.cubic) })
        );
        onVote(chosen ? 0 : direction);
      }}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
      <Animated.View style={nudgeStyle}>
        <MaterialCommunityIcons name={glyph} size={ACTION_BAR_ICON} color={color} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * The number rolls: a rise comes up from below, a fall comes down from above,
 * `motion.fast`. Only on a change — a score that mounts with the feed holds
 * still, or every card on the board would twitch as it loaded.
 */
function Score({ score, on }: { score: number; on: boolean }) {
  const styles = useThemedStyles(voteStyles);
  const previous = useRef(score);
  const delta = Math.sign(score - previous.current);
  useEffect(() => {
    previous.current = score;
  }, [score]);

  const entering =
    delta > 0
      ? FadeInDown.duration(motion.fast).withInitialValues({ transform: [{ translateY: STEP }] })
      : delta < 0
        ? FadeInUp.duration(motion.fast).withInitialValues({ transform: [{ translateY: -STEP }] })
        : undefined;

  return (
    <View style={styles.scoreWell}>
      <Animated.Text key={score} entering={entering} style={[styles.score, on && styles.scoreOn]}>
        {score}
      </Animated.Text>
    </View>
  );
}

const voteStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    alignSelf: 'flex-start' as const,
    minHeight: HIT_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    // The first capsule in the action bar, filled like the rest of them.
    backgroundColor: theme.color.fill,
  },
  arrow: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
  },
  // Two digits and a minus sign without the arrows shifting as the score
  // changes under a press. Clipped, so the number steps in from inside the
  // capsule rather than from over the arrows.
  scoreWell: {
    minWidth: space.xl,
    overflow: 'hidden' as const,
  },
  score: {
    ...type.labelStrong,
    color: theme.color.ink,
    textAlign: 'center' as const,
  },
  scoreOn: {
    color: theme.color.brass,
  },
  pressed: {
    opacity: 0.6,
  },
});
