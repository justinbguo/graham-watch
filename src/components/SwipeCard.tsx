import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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

const FLING_VELOCITY = 800;
// Past the commit point the card returns a third of the finger's travel, so the
// drag builds tension instead of running away with the thumb.
const DRAG_RESISTANCE = 0.34;
/** A quarter of the card's own width commits the swipe. */
const COMMIT_FRACTION = 0.25;
const ROTATION_DEGREES = 10;

/** Finger travel in, card travel out: one to one, then elastic past the commit point. */
function resist(travel: number, commit: number) {
  'worklet';
  const distance = Math.abs(travel);
  if (commit <= 0 || distance <= commit) return travel;
  return Math.sign(travel) * (commit + (distance - commit) * DRAG_RESISTANCE);
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
  // Measured rather than taken from `Dimensions`: the card is capped on a wide
  // window, and a browser resize has to move the commit point with it. A
  // module-scope snapshot is read once at import and then never updates.
  const cardWidth = useSharedValue(0);
  // The card leaves the window, not just its own column, so this one is a
  // viewport question.
  const { width: windowWidth } = useWindowDimensions();
  const offScreen = windowWidth * 1.5;

  const pan = Gesture.Pan()
    .enabled(isTop)
    // Activating on X alone keeps the card in its lane and leaves a vertical
    // drag to the photo taps underneath.
    .activeOffsetX([-12, 12])
    .onChange((event) => {
      dragX.value += event.changeX;
      cardX.value = resist(dragX.value, cardWidth.value * COMMIT_FRACTION);
    })
    .onEnd((event) => {
      const commit = cardWidth.value * COMMIT_FRACTION;
      const committed =
        (commit > 0 && Math.abs(dragX.value) > commit) ||
        Math.abs(event.velocityX) > FLING_VELOCITY;

      if (committed) {
        const direction: SwipeDirection =
          (dragX.value || event.velocityX) > 0 ? 'right' : 'left';
        cardX.value = withTiming(
          direction === 'right' ? offScreen : -offScreen,
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

  const cardStyle = useAnimatedStyle(() => {
    const width = cardWidth.value;
    return {
      transform: [
        { translateX: cardX.value },
        {
          rotate: width
            ? `${interpolate(cardX.value, [-width, width], [-ROTATION_DEGREES, ROTATION_DEGREES])}deg`
            : '0deg',
        },
      ],
    };
  });

  // One ring for both directions. It is invisible at centre, so the colour
  // swapping as the card crosses zero is never seen.
  const edgeStyle = useAnimatedStyle(() => {
    const commit = cardWidth.value * COMMIT_FRACTION;
    return {
      opacity: commit > 0 ? interpolate(Math.abs(cardX.value), [0, commit], [0, 1], 'clamp') : 0,
      borderColor: cardX.value > 0 ? save : danger,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(event) => {
          cardWidth.value = event.nativeEvent.layout.width;
        }}
        style={[styles.card, cardStyle]}>
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
