import * as Haptics from 'expo-haptics';
import { useState } from 'react';
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

import { ListingSummary } from '@/components/ListingSummary';
import { PhotoCaption } from '@/components/PhotoCaption';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { Button } from '@/components/ui';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { formatName } from '@/lib/format';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { inset, motion, radius, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const FLING_VELOCITY = 800;
// Past the commit point the card returns a third of the finger's travel, so the
// drag builds tension instead of running away with the thumb.
const DRAG_RESISTANCE = 0.34;
/** A quarter of the card's own width commits the swipe. */
const COMMIT_FRACTION = 0.25;
const ROTATION_DEGREES = 10;
/** How strong the commit wash gets. Past this the price stops reading. */
const WASH = 0.28;
/** How much of the card the photograph takes, and how tall it may ever get. */
const PHOTO_FRACTION = 0.58;
const PHOTO_MAX_RATIO = 1.25;

/** Finger travel in, card travel out: one to one, then elastic past the commit point. */
function resist(travel: number, commit: number) {
  'worklet';
  const distance = Math.abs(travel);
  if (commit <= 0 || distance <= commit) return travel;
  return Math.sign(travel) * (commit + (distance - commit) * DRAG_RESISTANCE);
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
  isTop,
}: {
  card: DeckCard;
  /** `releaseX` is where the card sat when the thumb let go, so a save can fly
      on from there rather than restarting at centre. */
  onSwipe: (direction: SwipeDirection, releaseX: number) => void;
  onExpandPhoto: (index: number) => void;
  onAsk: () => void;
  isTop: boolean;
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
  const cardX = useSharedValue(0);
  const thresholdFired = useSharedValue(false);
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
    // drag to the scroll view reading the details.
    .activeOffsetX([-12, 12])
    // A diagonal drag must not claim the card mid-scroll, or a thumb reading
    // the spec table flings the watch away instead of scrolling it.
    .failOffsetY([-12, 12])
    .onBegin(() => {
      thresholdFired.value = false;
    })
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
      cardX.value = withTiming(0, {
        duration: motion.settle,
        easing: Easing.out(Easing.cubic),
      });
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

  // One wash for both directions, filling the card below the photograph:
  // nothing in this app is drawn with an outline, and a tint over the picture
  // would colour the watch itself — a green Submariner is a different watch.
  // It is clear at centre, so the colour swapping as the card crosses zero is
  // never seen.
  const washStyle = useAnimatedStyle(() => {
    const commit = cardWidth.value * COMMIT_FRACTION;
    return {
      opacity: commit > 0 ? interpolate(Math.abs(cardX.value), [0, commit], [0, WASH], 'clamp') : 0,
      backgroundColor: cardX.value > 0 ? save : danger,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          cardWidth.value = width;
          setFrame((current) =>
            current.width === width && current.height === height ? current : { width, height }
          );
        }}
        style={[styles.card, cardStyle]}>
        {/* React Native's ScrollView, not Gesture Handler's. Gesture Handler's
            wraps a native gesture that takes the whole touch on web and the
            card then never moves at all — with or without a blocking relation
            between the two. A plain scroll view leaves the pointer to the pan,
            and the two axes never contend: the content is taller than the card
            but never wider. */}
        <ScrollView scrollEnabled={isTop} contentContainerStyle={styles.content}>
          <View style={[styles.photo, photoHeight ? { height: photoHeight } : null]}>
            <PhotoCarousel photos={card.photos} active={isTop} onExpand={onExpandPhoto} />
            <PhotoCaption name={formatName(card)} year={card.year} />
          </View>

          <View style={styles.summary}>
            <ListingSummary card={card} />
          </View>

          <View style={styles.body}>
            {/* No Save button: the right swipe is the save. A sold watch never
                enters the deck, so the inquiry is always worth offering. */}
            <ListingDetails
              card={card}
              actions={<Button label="Ask about this watch" onPress={onAsk} />}
            />
          </View>
        </ScrollView>

        <Animated.View
          pointerEvents="none"
          style={[styles.wash, { top: photoHeight }, washStyle]}
        />
      </Animated.View>
    </GestureDetector>
  );
}

const cardStyles = (theme: Theme) => ({
  card: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.color.surface,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
  content: {
    paddingBottom: inset.card,
  },
  // Until the card reports its height, one frame on a ratio close to the
  // measured result, so the photograph does not resize visibly on mount.
  photo: {
    aspectRatio: 1,
  },
  summary: {
    borderTopWidth: 1,
    borderColor: theme.color.border,
  },
  body: {
    paddingHorizontal: inset.card,
    paddingTop: space.sm,
  },
  // The drag reads at the edge, not across the photograph. Two pixels so the
  // tint survives against a busy image without colouring the watch itself.
  wash: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
