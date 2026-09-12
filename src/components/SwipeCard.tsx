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

import type { DeckCard, SwipeDirection } from '@/lib/database.types';
import { formatPrice, formatSpecs } from '@/lib/format';
import { theme } from '@/lib/theme';

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
          { duration: 180 },
          () => scheduleOnRN(onSwipe, direction)
        );
        return;
      }

      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${interpolate(translateX.value, [-SCREEN_WIDTH, SCREEN_WIDTH], [-12, 12])}deg` },
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
            <Text style={styles.photoEmptyLabel}>No photo</Text>
          </View>
        )}

        <Animated.View style={[styles.stamp, styles.saveStamp, saveStampStyle]}>
          <Text style={[styles.stampLabel, { color: theme.color.save }]}>SAVE</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.passStamp, passStampStyle]}>
          <Text style={[styles.stampLabel, { color: theme.color.danger }]}>PASS</Text>
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
          <Text style={styles.price}>{formatPrice(card)}</Text>
          {card.dealer ? (
            <Text style={styles.dealer} numberOfLines={1}>
              {card.dealer.name}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius * 1.5,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden',
  },
  photo: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyLabel: {
    color: theme.color.muted,
  },
  info: {
    padding: theme.space(2),
    gap: 2,
  },
  brand: {
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.muted,
  },
  model: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.color.text,
  },
  meta: {
    fontSize: 14,
    color: theme.color.muted,
  },
  price: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.color.text,
    paddingTop: theme.space(0.5),
  },
  dealer: {
    fontSize: 13,
    color: theme.color.muted,
    paddingTop: 2,
  },
  stamp: {
    position: 'absolute',
    top: theme.space(3),
    borderWidth: 3,
    borderRadius: theme.radius / 2,
    paddingHorizontal: theme.space(1.5),
    paddingVertical: theme.space(0.5),
  },
  saveStamp: {
    left: theme.space(2),
    borderColor: theme.color.save,
    transform: [{ rotate: '-14deg' }],
  },
  passStamp: {
    right: theme.space(2),
    borderColor: theme.color.danger,
    transform: [{ rotate: '14deg' }],
  },
  stampLabel: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
