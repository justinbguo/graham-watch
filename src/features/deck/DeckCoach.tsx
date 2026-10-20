import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { motion, radius, shadow, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Short coach on the deck. Each step stays until the user does the thing, then
 * the next step appears or the coach goes away.
 */
export function DeckCoach({ step }: { step: 'photos' | 'listings' }) {
  const styles = useThemedStyles(tutorialStyles);
  const copy =
    step === 'photos'
      ? {
          title: 'See every photo',
          body: 'Swipe the watch, or tap the bars above it, to move through the angles.',
        }
      : {
          title: 'Pass or save',
          body: 'Swipe left to pass. Swipe right to save the watch to your wishlist.',
        };

  return (
    <Animated.View
      entering={FadeIn.duration(motion.base)}
      exiting={FadeOut.duration(motion.fast)}
      style={styles.root}
      pointerEvents="box-none">
      <View style={styles.card} accessibilityRole="text" accessibilityLiveRegion="polite">
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
    </Animated.View>
  );
}

const tutorialStyles = (theme: Theme) => ({
  root: {
    position: 'absolute' as const,
    left: space.md,
    right: space.md,
    bottom: space.lg,
    zIndex: 20,
    alignItems: 'center' as const,
  },
  card: {
    width: '100%' as const,
    maxWidth: 360,
    backgroundColor: theme.color.raised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
    boxShadow: shadow.card,
  },
  title: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  body: {
    ...type.body,
    color: theme.color.textMuted,
  },
});
