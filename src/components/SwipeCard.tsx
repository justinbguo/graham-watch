import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ListingSummary } from '@/components/ListingSummary';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, motion, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const OFF_SCREEN = SCREEN_WIDTH * 1.5;
const FLING_VELOCITY = 800;
// Past the commit point the card returns a third of the finger's travel, so the
// drag builds tension instead of running away with the thumb.
const DRAG_RESISTANCE = 0.34;

/** Finger travel in, card travel out: one to one, then elastic past the commit point. */
function resist(travel: number) {
  'worklet';
  const distance = Math.abs(travel);
  if (distance <= SWIPE_THRESHOLD) return travel;
  return Math.sign(travel) * (SWIPE_THRESHOLD + (distance - SWIPE_THRESHOLD) * DRAG_RESISTANCE);
}

export function SwipeCard({
  card,
  onSwipe,
  onOpen,
  onExpandPhoto,
  isTop,
}: {
  card: DeckCard;
  onSwipe: (direction: SwipeDirection) => void;
  onOpen: () => void;
  onExpandPhoto: (index: number) => void;
  isTop: boolean;
}) {
  const styles = useThemedStyles(cardStyles);
  const { save, danger, textFaint } = useTheme().color;
  // Raw finger travel, and the resisted distance the card actually moves.
  const dragX = useSharedValue(0);
  const cardX = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(isTop)
    // Activating on X alone keeps the card in its lane and leaves a vertical
    // drag to the photo taps underneath.
    .activeOffsetX([-12, 12])
    .onChange((event) => {
      dragX.value += event.changeX;
      cardX.value = resist(dragX.value);
    })
    .onEnd((event) => {
      const committed =
        Math.abs(dragX.value) > SWIPE_THRESHOLD || Math.abs(event.velocityX) > FLING_VELOCITY;

      if (committed) {
        const direction: SwipeDirection =
          (dragX.value || event.velocityX) > 0 ? 'right' : 'left';
        cardX.value = withTiming(
          direction === 'right' ? OFF_SCREEN : -OFF_SCREEN,
          { duration: motion.fast, easing: Easing.out(Easing.cubic) },
          () => scheduleOnRN(onSwipe, direction)
        );
        return;
      }

      // Timing, not a spring: an overshoot past centre reads as the card
      // rejecting the drop rather than settling from it.
      dragX.value = 0;
      cardX.value = withTiming(0, {
        duration: motion.settle,
        easing: Easing.out(Easing.cubic),
      });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cardX.value },
      { rotate: `${interpolate(cardX.value, [-SCREEN_WIDTH, SCREEN_WIDTH], [-10, 10])}deg` },
    ],
  }));

  // One ring for both directions. It is invisible at centre, so the colour
  // swapping as the card crosses zero is never seen.
  const edgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(cardX.value), [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
    borderColor: cardX.value > 0 ? save : danger,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <PhotoCarousel photos={card.photos} active={isTop} onExpand={onExpandPhoto} />

        <Animated.View pointerEvents="none" style={[styles.edge, edgeStyle]} />

        {/* A bar, not a footnote under the price: the photo takes taps for
            paging, so this is the one place on the card that navigates, and it
            should look like a control rather than another line of prose. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${card.brand} ${card.model ?? ''}, details and dealer`.trim()}
          disabled={!isTop}
          onPress={onOpen}
          style={({ pressed }) => [styles.detailsBar, pressed && styles.detailsBarPressed]}>
          <Text style={styles.detailsLabel}>Details and dealer</Text>
          <MaterialCommunityIcons name="chevron-right" size={size.tabIcon} color={textFaint} />
        </Pressable>

        <ListingSummary card={card} />
      </Animated.View>
    </GestureDetector>
  );
}

const cardStyles = (theme: Theme) => ({
  card: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden' as const,
  },
  detailsBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: inset.card,
    paddingVertical: space.md,
    backgroundColor: theme.color.surfaceSunken,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.color.border,
  },
  detailsBarPressed: {
    backgroundColor: theme.color.border,
  },
  detailsLabel: {
    ...type.control,
    color: theme.color.textMuted,
  },
  // The drag reads at the edge, not across the photograph. Two pixels so the
  // tint survives against a busy image without colouring the watch itself.
  edge: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
});
