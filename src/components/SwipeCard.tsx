import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PhotoCarousel } from '@/components/PhotoCarousel';
import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, motion, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const OFF_SCREEN = SCREEN_WIDTH * 1.5;
// Worklets only see module-scope values. Keep this faint: the photo stays the point.
const WASH_OPACITY = 0.22;

export function SwipeCard({
  card,
  onSwipe,
  isTop,
}: {
  card: DeckCard;
  onSwipe: (direction: SwipeDirection) => void;
  isTop: boolean;
}) {
  const styles = useThemedStyles(cardStyles);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(isTop)
    // Without a threshold the pan claims the touch immediately and the photo
    // taps underneath never fire.
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onChange((event) => {
      translateX.value += event.changeX;
      translateY.value += event.changeY;
    })
    .onEnd((event) => {
      const flungFarEnough = Math.abs(translateX.value) > SWIPE_THRESHOLD;
      const flungFastEnough = Math.abs(event.velocityX) > 800;

      if (flungFarEnough || flungFastEnough) {
        const direction: SwipeDirection = translateX.value > 0 ? 'right' : 'left';
        translateX.value = withTiming(
          Math.sign(translateX.value || event.velocityX) * OFF_SCREEN,
          { duration: motion.fast },
          () => scheduleOnRN(onSwipe, direction)
        );
        return;
      }

      translateX.value = withSpring(0, motion.spring);
      translateY.value = withSpring(0, motion.spring);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, SCREEN_WIDTH], [-10, 10])}deg` },
    ],
  }));

  const saveWashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, WASH_OPACITY], 'clamp'),
  }));

  const passWashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [WASH_OPACITY, 0], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <PhotoCarousel photos={card.photos} active={isTop} />

        <Animated.View
          pointerEvents="none"
          style={[styles.wash, styles.saveWash, saveWashStyle]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.wash, styles.passWash, passWashStyle]}
        />

        <View style={styles.info}>
          <Text style={styles.brand} numberOfLines={1}>
            {card.brand}
          </Text>
          <Text style={styles.model} numberOfLines={1}>
            {card.model ?? 'Unknown model'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatSpecs(card)}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(card)}</Text>
            {card.dealer ? (
              <Text style={styles.dealer} numberOfLines={1}>
                {card.dealer.name}
              </Text>
            ) : null}
          </View>
        </View>
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
  info: {
    padding: inset.card,
    gap: stack.tight,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  brand: {
    ...type.eyebrow,
    color: theme.color.textMuted,
  },
  model: {
    ...type.title,
    color: theme.color.text,
    paddingTop: space.xs,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    paddingTop: space.sm,
  },
  price: {
    ...type.price,
    color: theme.color.text,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  // Colour is the only cue that a drag has caught, so it has to reach the edges
  // of the card. Kept faint: the photograph is the point, not the feedback.
  wash: {
    ...StyleSheet.absoluteFill,
  },
  saveWash: {
    backgroundColor: theme.color.save,
  },
  passWash: {
    backgroundColor: theme.color.danger,
  },
});
