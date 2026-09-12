import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { formatPrice, formatSpecs } from '@/lib/format';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, motion, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const OFF_SCREEN = SCREEN_WIDTH * 1.5;

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

  const saveStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], 'clamp'),
  }));

  const passStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], 'clamp'),
  }));

  const photo = card.photos[0]?.url;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.photoEmptyLabel}>No photograph</Text>
          </View>
        )}

        <Animated.View style={[styles.stamp, styles.saveStamp, saveStampStyle]}>
          <Text style={[styles.stampLabel, styles.saveLabel]}>Save</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.passStamp, passStampStyle]}>
          <Text style={[styles.stampLabel, styles.passLabel]}>Pass</Text>
        </Animated.View>

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
  photo: {
    flex: 1,
    backgroundColor: theme.color.surfaceSunken,
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  photoEmptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
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
  // Stamps sit over the photo, so they carry their own surface rather than
  // relying on whatever the image happens to be behind them.
  stamp: {
    position: 'absolute' as const,
    top: space.xl,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: inset.controlX,
    paddingVertical: space.sm,
    backgroundColor: theme.color.surface,
  },
  saveStamp: {
    left: space.lg,
    borderColor: theme.color.save,
    transform: [{ rotate: '-8deg' }],
  },
  passStamp: {
    right: space.lg,
    borderColor: theme.color.danger,
    transform: [{ rotate: '8deg' }],
  },
  // Bigger than an eyebrow: this has to read at a glance while the card moves.
  stampLabel: {
    ...type.title,
  },
  saveLabel: {
    color: theme.color.save,
  },
  passLabel: {
    color: theme.color.danger,
  },
});
