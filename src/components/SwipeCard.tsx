import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PhotoCaption } from '@/components/PhotoCaption';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button } from '@/components/ui';
import { ListingDetails } from '@/features/listings/ListingDetails';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, motion, radius, shadow, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const FLING_VELOCITY = 800;
// Past the commit point the card returns a third of the finger's travel, so the
// drag builds tension instead of running away with the thumb.
const DRAG_RESISTANCE = 0.34;
/** A quarter of the card's own width commits the swipe. */
const COMMIT_FRACTION = 0.25;
const ROTATION_DEGREES = 10;
/** How much of the card the photograph takes, and how tall it may ever get. */
const PHOTO_FRACTION = 0.58;
const PHOTO_MAX_RATIO = 1.25;
/** How far a lift may go before it resists: enough of the next photograph to recognise it. */
const PREVIEW_FRACTION = 0.42;

/** Finger travel in, card travel out: one to one, then elastic past the commit point. */
function resist(travel: number, commit: number) {
  'worklet';
  const distance = Math.abs(travel);
  if (commit <= 0 || distance <= commit) return travel;
  return Math.sign(travel) * (commit + (distance - commit) * DRAG_RESISTANCE);
}

/** Upward travel only. A downward drag is the scroll view's, never a preview. */
function resistUp(travel: number, limit: number) {
  'worklet';
  if (travel >= 0) return 0;
  const distance = -travel;
  if (limit <= 0 || distance <= limit) return travel;
  return -(limit + (distance - limit) * DRAG_RESISTANCE);
}

function thresholdHaptic() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => {});
}

function commitHaptic() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
}

export function SwipeCard({
  card,
  onSwipe,
  onExpandPhoto,
  onAsk,
  asking = false,
  isTop,
  nextPhoto,
}: {
  card: DeckCard;
  /** `releaseX` is where the card sat when the thumb let go, so a save can fly
      on from there rather than restarting at centre. */
  onSwipe: (direction: SwipeDirection, releaseX: number) => void;
  onExpandPhoto: (index: number) => void;
  onAsk: () => void;
  asking?: boolean;
  isTop: boolean;
  /** The photograph of the watch behind this one. Lifting the card shows it. */
  nextPhoto?: string;
}) {
  const styles = useThemedStyles(cardStyles);
  const { save, danger } = useTheme().color;
  // The photograph is sized against the card, not against its own width. Two
  // things have to be true on every phone: the price is readable without
  // scrolling, and the description is cut off rather than hidden, because the
  // cut is what says the card keeps going. A fixed aspect ratio can only
  // promise that on the screen it was chosen on.
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const photoHeight = frame.height
    ? Math.min(frame.height * PHOTO_FRACTION, frame.width * PHOTO_MAX_RATIO)
    : null;
  // Raw finger travel, and the resisted distance the card actually moves.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const cardX = useSharedValue(0);
  const lift = useSharedValue(0);
  const thresholdFired = useSharedValue(false);
  const previewFired = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const mode = useSharedValue<'undecided' | 'swipe' | 'peek'>('undecided');
  // Measured rather than taken from `Dimensions`: the card is capped on a wide
  // window, and a browser resize has to move the commit point with it. A
  // module-scope snapshot is read once at import and then never updates.
  const cardWidth = useSharedValue(0);
  const cardHeight = useSharedValue(0);
  const photoTop = useSharedValue(0);
  const canPreview = useSharedValue(Boolean(nextPhoto));
  useEffect(() => {
    canPreview.value = Boolean(nextPhoto);
  }, [canPreview, nextPhoto]);
  // The card leaves the window, not just its own column, so this one is a
  // viewport question.
  const { width: windowWidth } = useWindowDimensions();
  const offScreen = windowWidth * 1.5;

  const settle = { duration: motion.settle, easing: Easing.out(Easing.cubic) };

  const pan = Gesture.Pan()
    .enabled(isTop)
    .manualActivation(true)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (!touch) return;
      touchX.value = touch.x;
      touchY.value = touch.y;
      mode.value = 'undecided';
      thresholdFired.value = false;
      previewFired.value = false;
    })
    .onTouchesMove((event, state) => {
      // Two fingers on the card is a pinch on the photograph, not a drag. Left
      // to this gesture, the first of the two would have swiped the watch away
      // while the other was still zooming in on the dial.
      if (event.numberOfTouches > 1 && mode.value === 'undecided') {
        state.fail();
        return;
      }
      if (mode.value !== 'undecided') return;
      const touch = event.allTouches[0];
      if (!touch) return;
      const dx = touch.x - touchX.value;
      const dy = touch.y - touchY.value;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;

      // Horizontal still wins. A diagonal thumb reading the spec table must
      // not fling the watch, and it must not lift it either.
      if (Math.abs(dx) > Math.abs(dy)) {
        mode.value = 'swipe';
        lift.value = 0;
        dragX.value = dx;
        cardX.value = resist(dx, cardWidth.value * COMMIT_FRACTION);
        state.activate();
        return;
      }

      // The photograph does not scroll. An upward drag there lifts the card
      // so the next watch can show in the gap. The words underneath still scroll.
      const onPhoto = scrollY.value <= 1 && touchY.value < photoTop.value;
      if (canPreview.value && dy < 0 && onPhoto) {
        mode.value = 'peek';
        dragY.value = dy;
        lift.value = -resistUp(dy, cardHeight.value * PREVIEW_FRACTION);
        state.activate();
        return;
      }

      state.fail();
    })
    .onTouchesUp((_event, state) => {
      if (mode.value === 'undecided') state.fail();
    })
    .onChange((event) => {
      if (mode.value === 'swipe') {
        dragX.value += event.changeX;
        cardX.value = resist(dragX.value, cardWidth.value * COMMIT_FRACTION);
        return;
      }
      if (mode.value === 'peek') {
        dragY.value += event.changeY;
        lift.value = -resistUp(dragY.value, cardHeight.value * PREVIEW_FRACTION);
      }
    })
    .onEnd((event) => {
      if (mode.value !== 'swipe') return;

      const commit = cardWidth.value * COMMIT_FRACTION;
      const committed =
        (commit > 0 && Math.abs(dragX.value) > commit) ||
        Math.abs(event.velocityX) > FLING_VELOCITY;

      if (committed) {
        const direction: SwipeDirection =
          (dragX.value || event.velocityX) > 0 ? 'right' : 'left';
        scheduleOnRN(commitHaptic);

        // A save hands the card straight to the flight overlay, which picks it
        // up where the thumb left it and carries it to the Saved tab. Flinging
        // it off the right edge first would put two cards on screen for one
        // save, travelling in different directions.
        if (direction === 'right') {
          scheduleOnRN(onSwipe, 'right', cardX.value);
          return;
        }

        cardX.value = withTiming(
          -offScreen,
          { duration: motion.fast, easing: Easing.out(Easing.cubic) },
          () => scheduleOnRN(onSwipe, 'left', cardX.value)
        );
        return;
      }

      // Timing, not a spring: an overshoot past centre reads as the card
      // rejecting the drop rather than settling from it.
      dragX.value = 0;
      cardX.value = withTiming(0, settle);
    })
    .onFinalize(() => {
      if (mode.value !== 'peek') return;
      dragY.value = 0;
      lift.value = withTiming(0, settle);
    });

  useAnimatedReaction(
    () => {
      const commit = cardWidth.value * COMMIT_FRACTION;
      return commit > 0 && !thresholdFired.value && Math.abs(dragX.value) >= commit;
    },
    (crossed) => {
      if (!crossed) return;
      thresholdFired.value = true;
      scheduleOnRN(thresholdHaptic);
    }
  );

  useAnimatedReaction(
    () => lift.value >= space.xxl && !previewFired.value,
    (crossed) => {
      if (!crossed) return;
      previewFired.value = true;
      scheduleOnRN(thresholdHaptic);
    }
  );

  const cardStyle = useAnimatedStyle(() => {
    const width = cardWidth.value;
    return {
      borderBottomLeftRadius: interpolate(lift.value, [0, space.md], [radius.lg, 0], 'clamp'),
      borderBottomRightRadius: interpolate(lift.value, [0, space.md], [radius.lg, 0], 'clamp'),
      transform: [
        { translateX: cardX.value },
        { translateY: -lift.value },
        {
          rotate: width
            ? `${interpolate(cardX.value, [-width, width], [-ROTATION_DEGREES, ROTATION_DEGREES])}deg`
            : '0deg',
        },
      ],
    };
  });

  const peekStyle = useAnimatedStyle(() => ({
    height: lift.value <= 0 ? 0 : lift.value + space.sm,
    opacity: lift.value <= 0 ? 0 : 1,
  }));

  // A ring around the whole card: green to save, red to pass. It reaches full
  // strength exactly at the commit point, so the edge going solid is the card
  // saying "let go now". Drawn on the frame rather than on the content, which
  // is why it holds its shape wherever the card is scrolled to — and an edge
  // rather than a tint, because a wash over the photograph colours the watch
  // itself, and a green Submariner is a different watch.
  //
  // Clear at centre, so the colour swapping as the card crosses zero is never
  // seen.
  const ringStyle = useAnimatedStyle(() => {
    const commit = cardWidth.value * COMMIT_FRACTION;
    return {
      opacity: commit > 0 ? interpolate(Math.abs(cardX.value), [0, commit], [0, 1], 'clamp') : 0,
      borderColor: cardX.value > 0 ? save : danger,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          cardWidth.value = width;
          cardHeight.value = height;
          const nextPhotoHeight = Math.min(height * PHOTO_FRACTION, width * PHOTO_MAX_RATIO);
          photoTop.value = nextPhotoHeight;
          setFrame((current) =>
            current.width === width && current.height === height ? current : { width, height }
          );
        }}
        style={styles.frame}>
        <View style={styles.shell}>
        {nextPhoto && photoHeight ? (
          <Animated.View pointerEvents="none" style={[styles.peek, peekStyle]}>
            {/* The card behind is the same size, so lifting this one would show
                its buttons. The strip is that watch's photograph, clipped to the gap. */}
            <Image
              source={{ uri: nextPhoto }}
              style={{ width: '100%', height: photoHeight }}
              contentFit="cover"
              accessible={false}
            />
          </Animated.View>
        ) : null}
        <Animated.View style={[styles.card, cardStyle]}>
        {/* React Native's ScrollView, not Gesture Handler's. Gesture Handler's
            wraps a native gesture that takes the whole touch on web and the
            card then never moves at all — with or without a blocking relation
            between the two. A plain scroll view leaves the pointer to the pan,
            and the two axes never contend: the content is taller than the card
            but never wider. */}
        {/* No indicator. The card is an object in the hand, and a bar down its
            right edge draws a second line beside the photograph — the app
            hides web scrollbars for the same reason. The cut-off description
            at the bottom edge is what says the card continues. */}
        <ScrollView
          scrollEnabled={isTop}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollY.value = event.nativeEvent.contentOffset.y;
          }}
          contentContainerStyle={styles.content}>
          <View style={[styles.photo, photoHeight ? { height: photoHeight } : styles.photoPending]}>
            <PhotoCarousel photos={card.photos} active={isTop} onExpand={onExpandPhoto} />
            <PhotoCaption card={card} />
          </View>

          <View style={styles.body}>
            {/* Save is the right swipe, started from the button instead of the
                thumb. A sold watch never enters the deck, so the inquiry is
                always worth offering. */}
            <ListingDetails
              card={card}
              actions={
                <>
                  <Button
                    label="Save watch"
                    icon="bookmark"
                    onPress={() => onSwipe('right', 0)}
                  />
                  <Button
                    label="Ask about this watch"
                    icon="email"
                    loading={asking}
                    onPress={onAsk}
                  />
                </>
              }
            />
          </View>
        </ScrollView>

        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

const cardStyles = (theme: Theme) => ({
  // The frame holds the shadow. The shell clips the lift. Putting the shadow
  // on the clipping view would cut it off, and the card would slide up over
  // the header if nothing clipped it.
  frame: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    boxShadow: shadow.card,
  },
  shell: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  card: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.color.raised,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  peek: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden' as const,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    backgroundColor: theme.color.raised,
  },
  content: {
    paddingBottom: inset.card,
  },
  // Full width of the card. The height cap must not narrow it: a square ratio
  // beside a shorter height leaves the card showing on the right.
  photo: {
    width: '100%' as const,
  },
  // Until the card reports its height, one frame on a ratio close to the
  // measured result, so the photograph does not resize visibly on mount.
  photoPending: {
    aspectRatio: 1,
  },
  body: {
    paddingHorizontal: inset.card,
    // The photograph now carries the name, the price and the dealer, so the
    // description opens the block under it.
    paddingTop: space.md,
  },
  // Over everything, on the card's own frame, so it never moves with the
  // scroll underneath it.
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: size.ring,
    borderRadius: radius.lg,
  },
});
