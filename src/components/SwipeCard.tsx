import { useCallback, useEffect, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PhotoCaption } from '@/components/PhotoCaption';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { impact, tick } from '@/lib/haptics';
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
// Timing, not a spring: an overshoot past centre reads as the card rejecting
// the drop rather than settling from it.
const SETTLE = { duration: motion.settle, easing: Easing.out(Easing.cubic) };
/** Finger travel in, card travel out: one to one, then elastic past the commit point. */
function resist(travel: number, commit: number) {
  'worklet';
  const distance = Math.abs(travel);
  if (commit <= 0 || distance <= commit) return travel;
  return Math.sign(travel) * (commit + (distance - commit) * DRAG_RESISTANCE);
}

function clampScroll(offset: number, content: number, view: number) {
  'worklet';
  const max = Math.max(0, content - view);
  return Math.min(Math.max(offset, 0), max);
}

/** Downward travel only. An upward drag scrolls the card. */
function resistDown(travel: number, limit: number) {
  'worklet';
  if (travel <= 0) return 0;
  if (limit <= 0 || travel <= limit) return travel;
  return limit + (travel - limit) * DRAG_RESISTANCE;
}

export function SwipeCard({
  card,
  onSwipe,
  onExpandPhoto,
  isTop,
  nextPhoto,
  returning = false,
}: {
  card: DeckCard;
  /** `releaseX` is where the card sat when the thumb let go, so a save can fly
      on from there rather than restarting at centre. */
  onSwipe: (direction: SwipeDirection, releaseX: number) => void;
  onExpandPhoto: (index: number) => void;
  isTop: boolean;
  /** The photograph of the watch behind this one. Lifting the card shows it. */
  nextPhoto?: string;
  /** An undone pass. The card comes back in by the edge it left, rather than
      appearing on top of the pile as if it had never gone. */
  returning?: boolean;
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
  // The card leaves the window, not just its own column, so this one is a
  // viewport question.
  const { width: windowWidth } = useWindowDimensions();
  const offScreen = windowWidth * 1.5;

  // Raw finger travel, and the resisted distance the card actually moves.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // A returning card starts where a pass ends, and settles in the way a
  // declined swipe does. The ring and the fade come back with it: the exit
  // run backwards.
  const cardX = useSharedValue(returning ? -offScreen : 0);
  // Solid while a thumb is down. The ring says the decision; fading the watch
  // under the finger would make an object in the hand into a ghost. The
  // dissolve starts when the card is let go, on the same clock as the travel,
  // so the two read as one leaving.
  const cardOpacity = useSharedValue(returning ? 0 : 1);
  useEffect(() => {
    if (!returning) return;
    cardX.value = withTiming(0, SETTLE);
    cardOpacity.value = withTiming(1, SETTLE);
  }, [cardOpacity, cardX, returning]);
  const lift = useSharedValue(0);
  const thresholdFired = useSharedValue(false);
  const previewFired = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const mode = useSharedValue<'undecided' | 'swipe' | 'peek' | 'scroll'>('undecided');
  // The scroll view does not scroll itself. Its pan was claiming every
  // downward drag, so the card never got the one that reveals the next watch.
  // Left and right were unaffected: a scroll view has nothing to do sideways.
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const contentHeight = useSharedValue(0);
  const portHeight = useSharedValue(0);
  const web = Platform.OS === 'web';
  // The wheel listener needs the scroll view to have mounted.
  const [portReady, setPortReady] = useState(false);
  // Measured rather than taken from `Dimensions`: the card is capped on a wide
  // window, and a browser resize has to move the commit point with it. A
  // module-scope snapshot is read once at import and then never updates.
  const cardWidth = useSharedValue(0);
  const cardHeight = useSharedValue(0);
  const canPreview = useSharedValue(Boolean(nextPhoto));
  useEffect(() => {
    canPreview.value = Boolean(nextPhoto);
  }, [canPreview, nextPhoto]);

  const applyWebScroll = useCallback(
    (offset: number) => {
      const node = scroller.current as {
        scrollTo?: (options: { y: number; animated: boolean }) => void;
        getScrollableNode?: () => { scrollTop: number };
        scrollTop?: number;
      } | null;
      if (!node) return;
      if (node.scrollTo) {
        node.scrollTo({ y: offset, animated: false });
        return;
      }
      const element = node.getScrollableNode?.() ?? node;
      if (typeof element.scrollTop === 'number') element.scrollTop = offset;
    },
    [scroller]
  );

  // The scroll view ignores the wheel while scrolling is off, so the page
  // would scroll instead. This listener keeps the wheel on the card.
  useEffect(() => {
    if (!web || !portReady) return;
    const node = scroller.current as {
      getScrollableNode?: () => HTMLElement;
      addEventListener?: HTMLElement['addEventListener'];
    } | null;
    const element = node?.getScrollableNode?.() ?? (node as unknown as HTMLElement | null);
    if (!element?.addEventListener) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const view = portHeight.value > 0 ? portHeight.value : cardHeight.value;
      const next = clampScroll(scrollY.value + event.deltaY, contentHeight.value, view);
      scrollY.value = next;
      element.scrollTop = next;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [web, portReady, scroller, portHeight, cardHeight, contentHeight, scrollY]);

  // Reanimated's scrollTo is a no-op on web, and calling it warns every frame.
  function place(offset: number) {
    'worklet';
    const view = portHeight.value > 0 ? portHeight.value : cardHeight.value;
    const next = clampScroll(offset, contentHeight.value, view);
    scrollY.value = next;
    if (web) {
      scheduleOnRN(applyWebScroll, next);
      return;
    }
    scrollTo(scroller, 0, next, false);
  }

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
      // not fling the watch, and it must not slide it either.
      if (Math.abs(dx) > Math.abs(dy)) {
        mode.value = 'swipe';
        lift.value = 0;
        dragX.value = dx;
        cardX.value = resist(dx, cardWidth.value * COMMIT_FRACTION);
        state.activate();
        return;
      }

      // At the top of the scroll a downward drag has nowhere to go, so the
      // card slides down until the watch behind fills the frame.
      if (canPreview.value && dy > 0 && scrollY.value <= 1) {
        mode.value = 'peek';
        dragY.value = dy;
        lift.value = resistDown(dy, cardHeight.value);
        state.activate();
        return;
      }

      mode.value = 'scroll';
      place(scrollY.value - dy);
      state.activate();
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
        lift.value = resistDown(dragY.value, cardHeight.value);
        return;
      }
      if (mode.value === 'scroll') {
        place(scrollY.value - event.changeY);
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
        scheduleOnRN(impact);

        // A save hands the card straight to the flight overlay, which picks it
        // up where the thumb left it and carries it to the Saved tab. Flinging
        // it off the right edge first would put two cards on screen for one
        // save, travelling in different directions.
        if (direction === 'right') {
          scheduleOnRN(onSwipe, 'right', cardX.value);
          return;
        }

        // One card-width, not off the window. The old exit ran to 1.5 screens
        // inside motion.fast, which put the fade past the edge: the card was
        // gone before it had thinned. Stopping at its own width keeps the
        // dissolve on screen, and the next swipe waits the same 160ms it did.
        const leave = { duration: motion.fast, easing: Easing.out(Easing.cubic) };
        const distance = cardWidth.value > 0 ? cardWidth.value : offScreen;
        cardX.value = withTiming(-distance, leave, () =>
          scheduleOnRN(onSwipe, 'left', cardX.value)
        );
        cardOpacity.value = withTiming(0, leave);
        return;
      }

      dragX.value = 0;
      cardX.value = withTiming(0, SETTLE);
    })
    .onFinalize(() => {
      if (mode.value !== 'peek') return;
      dragY.value = 0;
      lift.value = withTiming(0, SETTLE);
    });

  useAnimatedReaction(
    () => {
      const commit = cardWidth.value * COMMIT_FRACTION;
      return commit > 0 && !thresholdFired.value && Math.abs(dragX.value) >= commit;
    },
    (crossed) => {
      if (!crossed) return;
      thresholdFired.value = true;
      scheduleOnRN(tick);
    }
  );

  useAnimatedReaction(
    () => lift.value >= space.xxl && !previewFired.value,
    (crossed) => {
      if (!crossed) return;
      previewFired.value = true;
      scheduleOnRN(tick);
    }
  );

  // Both axes sit on the frame, outside the shell. The shell clips to the
  // rounded rectangle, and a transform inside it was cutting the card once
  // the drag carried it past its own edge.
  const swipeStyle = useAnimatedStyle(() => {
    const width = cardWidth.value;
    return {
      opacity: cardOpacity.value,
      transform: [
        { translateX: cardX.value },
        { translateY: lift.value },
        {
          rotate: width
            ? `${interpolate(cardX.value, [-width, width], [-ROTATION_DEGREES, ROTATION_DEGREES])}deg`
            : '0deg',
        },
      ],
    };
  });

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
      <Animated.View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          cardWidth.value = width;
          cardHeight.value = height;
          setFrame((current) =>
            current.width === width && current.height === height ? current : { width, height }
          );
        }}
        style={[styles.frame, swipeStyle]}>
        <View style={styles.shell}>
        {/* The card behind is the same size and already painted under this one.
            This one moves out of the way whole, as far as it is tall. */}
        <View style={styles.card}>
        {/* Scrolling is off on the view itself. Its pan was taking every
            downward drag, and left and right only worked because a scroll
            view has nothing to do sideways. The card's pan scrolls the words
            now, and reveals the next watch when there is nowhere left to
            scroll. No indicator: a bar down the right edge draws a second
            line beside the photograph. */}
        <Animated.ScrollView
          ref={scroller}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          style={styles.scroller}
          onContentSizeChange={(_width, height) => {
            contentHeight.value = height;
          }}
          onLayout={(event) => {
            portHeight.value = event.nativeEvent.layout.height;
            setPortReady(true);
          }}
          contentContainerStyle={styles.content}>
          <View style={[styles.photo, photoHeight ? { height: photoHeight } : styles.photoPending]}>
            <PhotoCarousel photos={card.photos} active={isTop} onExpand={onExpandPhoto} />
            <PhotoCaption card={card} />
          </View>

          <View style={styles.body}>
            {/* No buttons on the card. The swipe is the verdict, and the
                inquiry waits on the listing route a saved watch opens. */}
            <ListingDetails card={card} />
          </View>
        </Animated.ScrollView>

        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const cardStyles = (theme: Theme) => ({
  // The frame holds the shadow and the movement. The shell only rounds the
  // card. Clipping the movement cut the watch once the drag left the rectangle.
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
  scroller: {
    flex: 1,
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
