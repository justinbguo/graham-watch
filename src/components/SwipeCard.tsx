import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { Platform, StyleSheet, Text, useWindowDimensions, View, type View as ViewType } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PhotoCaption } from '@/components/PhotoCaption';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { DealerSiteButton } from '@/features/listings/DealerSiteButton';
import { ListingDetails } from '@/features/listings/ListingDetails';
import { formatTitle } from '@/lib/format';
import { listingSourceUrl } from '@/lib/listingSource';
import { impact, tick } from '@/lib/haptics';
import { deckStage } from '@/lib/layout';
import { setPhotoLaunchRect } from '@/lib/photoLaunch';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import {
  cardDismissDuration,
  cardSettleDuration,
  inset,
  layout,
  motion,
  radius,
  shadow,
  size,
  space,
  type,
  type Theme,
} from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const FLING_VELOCITY = 800;
// Past the commit point the card returns a third of the finger's travel, so the
// drag builds tension instead of running away with the thumb.
const DRAG_RESISTANCE = 0.34;
/** A quarter of the card's own width commits the swipe. */
const COMMIT_FRACTION = 0.25;
/**
 * Where a pass has faded out, in fractions of the card's width. The drag
 * resists past the commit point, so a thumb only carries the card to about
 * half its width. A fade measured out to a full width would finish in a
 * distance the finger never reaches.
 */
const FADE_FRACTION = 0.55;
const ROTATION_DEGREES = 10;
/** How much of the card the photograph takes, and how tall it may ever get. */
const PHOTO_FRACTION = 0.58;
const PHOTO_MAX_RATIO = 1.25;

/** One height for every card in the stack, from the stage the pile shares. */
export function deckPhotoHeight(frame: { width: number; height: number }) {
  if (!frame.width || !frame.height) return null;
  return Math.min(frame.height * PHOTO_FRACTION, frame.width * PHOTO_MAX_RATIO);
}
// Timing, not a spring: an overshoot past centre reads as the card rejecting
// the drop rather than settling from it.
const SETTLE_EASING = Easing.out(Easing.cubic);
const WEB_DISMISS_MIN = 340;
const WEB_DISMISS_MAX = 560;

function dismissTiming(width: number, web: boolean) {
  'worklet';
  if (!web) return motion.fast;
  const w = width > 0 ? width : layout.cardWeb;
  return Math.min(
    WEB_DISMISS_MAX,
    Math.max(WEB_DISMISS_MIN, Math.round((w / layout.card) * motion.smooth))
  );
}

function settleTiming(web: boolean) {
  'worklet';
  return web ? motion.smooth : motion.settle;
}
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

export type SwipeCardHandle = {
  /** Keyboard stand-in for a thumb: same exit a committed drag would take. */
  fling: (direction: SwipeDirection) => void;
};

export const SwipeCard = memo(forwardRef<
  SwipeCardHandle,
  {
    card: DeckCard;
    onSwipe: (card: DeckCard, direction: SwipeDirection, releaseX: number) => boolean;
    onExpandPhoto: (card: DeckCard, index: number) => void;
    /** The exit animation finished. The deck can drop the slot it was holding. */
    onExitDone?: (id: string) => void;
    /** Paint order. Sibling index stays put so the native view is not moved. */
    zIndex?: number;
    isTop: boolean;
    /** The photograph of the watch behind this one. Lifting the card shows it. */
    nextPhoto?: string;
    /** An undone pass. The card comes back in by the edge it left, rather than
        appearing on top of the pile as if it had never gone. */
    returning?: boolean;
    /** The deck screen owns the roll bars above the stack; only the top card syncs. */
    photoIndex?: number;
    onPhotoIndexChange?: (index: number) => void;
    /** Deck catalogue line under the card. Opacity follows scroll depth. */
    footerReveal?: SharedValue<number>;
    /** From the deck stage so every card in the pile shares one photo height. */
    plateHeight?: number | null;
  }
>(function SwipeCard(
  {
    card,
    onSwipe,
    onExpandPhoto,
    onExitDone,
    zIndex = 0,
    isTop,
    nextPhoto,
    returning = false,
    photoIndex: photoIndexProp,
    onPhotoIndexChange,
    footerReveal,
    plateHeight: plateHeightProp,
  },
  ref
) {
  const styles = useThemedStyles(cardStyles);
  const { save, danger } = useTheme().color;
  // The photograph is sized against the card, not against its own width. Two
  // things have to be true on every phone: the price is readable without
  // scrolling, and the description is cut off rather than hidden, because the
  // cut is what says the card keeps going. A fixed aspect ratio can only
  // promise that on the screen it was chosen on.
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [photoIndexLocal, setPhotoIndexLocal] = useState(0);
  const photoControlled = photoIndexProp !== undefined && onPhotoIndexChange !== undefined;
  const photoIndex = photoControlled ? photoIndexProp : photoIndexLocal;
  const setPhotoIndex = photoControlled ? onPhotoIndexChange : setPhotoIndexLocal;

  useEffect(() => {
    if (!photoControlled) setPhotoIndexLocal(0);
  }, [card.id, photoControlled]);
  const photoHeight =
    plateHeightProp ??
    (frame.height ? Math.min(frame.height * PHOTO_FRACTION, frame.width * PHOTO_MAX_RATIO) : null);
  // The card leaves the window, not just its own column, so this one is a
  // viewport question.
  const { width: windowWidth } = useWindowDimensions();
  const offScreen = windowWidth * 1.5;

  // Raw finger travel, and the resisted distance the card actually moves.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // A returning card starts where a pass ends, and settles in the way a
  // declined swipe does. Opacity is derived from cardX, so the fade comes
  // back with it.
  const cardX = useSharedValue(returning ? -offScreen : 0);
  const lift = useSharedValue(0);
  const thresholdFired = useSharedValue(false);
  const previewFired = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const mode = useSharedValue<'undecided' | 'swipe' | 'peek' | 'scroll' | 'pinch'>('undecided');
  // The photograph's pinch runs alongside this pan instead of losing to it.
  const panRef = useRef<GestureType | undefined>(undefined);
  // The scroll view does not scroll itself. Its pan was claiming every
  // downward drag, so the card never got the one that reveals the next watch.
  // Left and right were unaffected: a scroll view has nothing to do sideways.
  const scroller = useAnimatedRef<Animated.ScrollView>();
  const contentHeight = useSharedValue(0);
  const portHeight = useSharedValue(0);
  const web = Platform.OS === 'web';
  const split = deckStage(Platform.OS, windowWidth).split;
  const webSplit = useSharedValue(split);
  webSplit.value = split;
  // Whether this card currently owns the thumb. Written during render so the
  // gesture, which is created once, sees the promotion on the next frame
  // without the native handler being torn down and attached again.
  const top = useSharedValue(isTop);
  top.value = isTop;
  const handedOff = useSharedValue(false);
  const off = useSharedValue(offScreen);
  off.value = offScreen;
  const drivesFooter = useSharedValue(isTop);
  drivesFooter.value = isTop;
  const settleConfig = { duration: cardSettleDuration(web), easing: SETTLE_EASING };
  // The wheel listener needs the scroll view to have mounted.
  const [portReady, setPortReady] = useState(false);
  // Touches pass through once the swipe is committed, one render before the
  // deck has promoted the card underneath.
  const [handsOff, setHandsOff] = useState(false);
  // Measured rather than taken from `Dimensions`: the card is capped on a wide
  // window, and a browser resize has to move the commit point with it. A
  // module-scope snapshot is read once at import and then never updates.
  const cardWidth = useSharedValue(0);
  const cardHeight = useSharedValue(0);
  const canPreview = useSharedValue(Boolean(nextPhoto));
  useEffect(() => {
    canPreview.value = Boolean(nextPhoto);
  }, [canPreview, nextPhoto]);
  // A key fling in flight. A second press must not stack two exits on one card.
  const leaving = useRef(false);
  const cardRef = useRef(card);
  cardRef.current = card;
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const onExitDoneRef = useRef(onExitDone);
  onExitDoneRef.current = onExitDone;
  const photoPlateRef = useRef<ViewType>(null);
  const openFullScreen = useCallback(
    (at: number) => {
      photoPlateRef.current?.measureInWindow((x, y, width, height) => {
        setPhotoLaunchRect({ x, y, width, height });
        onExpandPhoto(card, at);
      });
    },
    [card, onExpandPhoto],
  );
  useEffect(() => {
    leaving.current = false;
    handedOff.value = false;
    setHandsOff(false);
  }, [card.id, handedOff]);

  useEffect(() => {
    if (!returning) return;
    // Undo of a card that is still flying: stop treating the exit as committed
    // and bring it back by the edge it left.
    leaving.current = false;
    handedOff.value = false;
    setHandsOff(false);
    cardX.value = withTiming(0, settleConfig);
    // settleConfig is a fresh object every render; the animation should start
    // when the card is restored, not on every paint after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardX, handedOff, returning]);

  const commit = useCallback((direction: SwipeDirection, releaseX: number) => {
    const accepted = onSwipeRef.current(cardRef.current, direction, releaseX);
    if (!accepted) {
      leaving.current = false;
      handedOff.value = false;
      setHandsOff(false);
      dragX.value = 0;
      cardX.value = withTiming(0, { duration: cardSettleDuration(web), easing: SETTLE_EASING });
      return;
    }
    // Drop touches on this card before the next paint, so the one underneath
    // — already mounted, gesture already attached — can take the next thumb
    // while this one is still leaving.
    if (direction === 'left') setHandsOff(true);
  }, [cardX, dragX, handedOff, web]);

  const exitDone = useCallback(() => {
    onExitDoneRef.current?.(cardRef.current.id);
  }, []);

  useImperativeHandle(ref, () => ({
    fling: (direction) => {
      if (!top.value || handedOff.value || leaving.current) return;
      handedOff.value = true;
      leaving.current = true;
      impact();

      if (direction === 'right') {
        // Same as a committed right drag: the flight overlay takes the card
        // from centre rather than flinging it off the edge first.
        commit('right', 0);
        return;
      }

      const distance = cardWidth.value > 0 ? cardWidth.value : off.value;
      cardX.value = withTiming(
        -distance,
        { duration: cardDismissDuration(distance, web), easing: SETTLE_EASING },
        (finished) => {
          'worklet';
          if (finished) scheduleOnRN(exitDone);
        },
      );
      // The deck promotes the next card now. Waiting for this timing to finish
      // was the gap where the next card sat there and would not move.
      commit('left', -distance);
    },
  }), [commit, exitDone]);

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

  // The card under the top one must not keep a scroll offset when it promotes.
  useEffect(() => {
    if (!isTop) return;
    scrollY.value = 0;
    if (web) applyWebScroll(0);
    else scrollTo(scroller, 0, 0, false);
  }, [isTop, card.id, applyWebScroll, scroller, scrollY, web]);

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

  function syncFooterReveal() {
    'worklet';
    // Every mounted card shares the catalogue line. Only the one in hand
    // should move it, or a card behind would write over the scroll.
    if (!drivesFooter.value || !footerReveal) return;
    const view = portHeight.value > 0 ? portHeight.value : cardHeight.value;
    const max = Math.max(0, contentHeight.value - view);
    if (max <= 8) {
      footerReveal.value = 1;
      return;
    }
    footerReveal.value = interpolate(
      scrollY.value,
      [max * 0.55, max],
      [0, 1],
      Extrapolation.CLAMP
    );
  }

  useAnimatedReaction(
    () => [scrollY.value, contentHeight.value, portHeight.value, cardHeight.value],
    () => {
      syncFooterReveal();
    }
  );

  // Reanimated's scrollTo is a no-op on web, and calling it warns every frame.
  function place(offset: number) {
    'worklet';
    const view = portHeight.value > 0 ? portHeight.value : cardHeight.value;
    const next = clampScroll(offset, contentHeight.value, view);
    scrollY.value = next;
    syncFooterReveal();
    if (web) {
      scheduleOnRN(applyWebScroll, next);
      return;
    }
    scrollTo(scroller, 0, next, false);
  }

  // Created once. `.enabled(isTop)` used to flip when the card was promoted,
  // and that rebind is what sat between "the card is showing" and "the card
  // moves". The handler stays attached; `top` says whether this one may take
  // the thumb. `place` is the scroll worklet from the first render — it only
  // reads shared values, which keep their current numbers.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withRef(panRef)
        .manualActivation(true)
        .onTouchesDown((event, state) => {
          'worklet';
          if (!top.value || handedOff.value) {
            state.fail();
            return;
          }
          // Two fingers on the card is a pinch on the photograph, not a drag. The
          // first finger has usually moved before the second lands, so this has
          // to undo a swipe or a scroll already under way: the card goes back to
          // centre and the pan stands down.
          if (event.numberOfTouches > 1) {
            const wasActive = mode.value !== 'undecided' && mode.value !== 'pinch';
            mode.value = 'pinch';
            dragX.value = 0;
            dragY.value = 0;
            cardX.value = withTiming(0, { duration: settleTiming(web), easing: SETTLE_EASING });
            lift.value = withTiming(0, { duration: settleTiming(web), easing: SETTLE_EASING });
            if (wasActive) state.end();
            else state.fail();
            return;
          }
          const touch = event.allTouches[0];
          if (!touch) return;
          touchX.value = touch.x;
          touchY.value = touch.y;
          mode.value = 'undecided';
          thresholdFired.value = false;
          previewFired.value = false;
        })
        .onTouchesMove((event, state) => {
          'worklet';
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

          // On web the photograph is a fixed column; only the right pane scrolls.
          if (webSplit.value && touchX.value < cardWidth.value * 0.5) {
            state.fail();
            return;
          }

          mode.value = 'scroll';
          place(scrollY.value - dy);
          state.activate();
        })
        .onTouchesUp((_event, state) => {
          'worklet';
          if (mode.value === 'undecided') state.fail();
        })
        .onChange((event) => {
          'worklet';
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
          'worklet';
          if (mode.value !== 'swipe' || handedOff.value) return;

          const mark = cardWidth.value * COMMIT_FRACTION;
          const committed =
            (mark > 0 && Math.abs(dragX.value) > mark) || Math.abs(event.velocityX) > FLING_VELOCITY;

          if (committed) {
            const direction: SwipeDirection = (dragX.value || event.velocityX) > 0 ? 'right' : 'left';
            handedOff.value = true;
            scheduleOnRN(impact);

            // A save hands the card straight to the flight overlay, which picks it
            // up where the thumb left it and carries it to the Wishlist tab. Flinging
            // it off the right edge first would put two cards on screen for one
            // save, travelling in different directions.
            if (direction === 'right') {
              scheduleOnRN(commit, 'right', cardX.value);
              return;
            }

            // One card-width, not off the window. Travelling on to 1.5 screens
            // put the last of the fade past the edge. The opacity follows cardX,
            // so this finish is the drag's fade carried to its end. The deck hears
            // about the pass now, not when the timing ends, so the next card can
            // be swiped while this one is still leaving.
            const distance = cardWidth.value > 0 ? cardWidth.value : off.value;
            cardX.value = withTiming(
              -distance,
              { duration: dismissTiming(distance, web), easing: SETTLE_EASING },
              (finished) => {
                'worklet';
                if (finished) scheduleOnRN(exitDone);
              },
            );
            scheduleOnRN(commit, 'left', -distance);
            return;
          }

          dragX.value = 0;
          cardX.value = withTiming(0, { duration: settleTiming(web), easing: SETTLE_EASING });
        })
        .onFinalize(() => {
          'worklet';
          if (mode.value !== 'peek') return;
          dragY.value = 0;
          lift.value = withTiming(0, { duration: settleTiming(web), easing: SETTLE_EASING });
        }),
    [commit, exitDone],
  );

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
    // Solid until the pass has caught, then thinning as the card travels its
    // own width. A rightward drag stays solid: that card is about to be a
    // photograph flying to the wishlist, and fading it first would pop back to full
    // when the flight took over.
    const commit = width * COMMIT_FRACTION;
    const gone = width > 0 ? width * FADE_FRACTION : 1;
    const opacity =
      cardX.value >= 0 ? 1 : interpolate(cardX.value, [-gone, -commit], [0, 1], 'clamp');
    return {
      opacity,
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
  const sourceUrl = listingSourceUrl(card.source_url);
  const dealerSite = sourceUrl ? <DealerSiteButton card={card} surface="buy" grouped /> : null;

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
        testID={`deck-card-${card.id}`}
        accessibilityLabel={isTop ? formatTitle(card) : undefined}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          cardWidth.value = width;
          cardHeight.value = height;
          setFrame((current) =>
            current.width === width && current.height === height ? current : { width, height }
          );
        }}
        style={[
          styles.frame,
          swipeStyle,
          // The shadow lives on `styles.frame`, which does not change when this
          // card is promoted. A new z-index paints it in front; it does not
          // rebuild the layer. Touches go to the card in hand only.
          { zIndex, pointerEvents: isTop && !handsOff ? ('auto' as const) : ('none' as const) },
        ]}>
        <View style={styles.shell}>
        {/* The card behind is the same size and already painted under this one.
            This one moves out of the way whole, as far as it is tall. */}
        <View style={styles.card}>
        {split ? (
          <View style={styles.webRow}>
            <View style={styles.webPhotoColumn}>
              <View ref={photoPlateRef} style={styles.webPhoto}>
                <PhotoCarousel
                  photos={card.photos}
                  active={isTop}
                  index={photoIndex}
                  onIndexChange={setPhotoIndex}
                  showBars={false}
                  onExpand={openFullScreen}
                  measureRef={photoPlateRef}
                  alongside={panRef}
                />
                <PhotoCaption
                  card={card}
                  onExpand={isTop ? () => openFullScreen(photoIndex) : undefined}
                />
              </View>
            </View>
            <Animated.ScrollView
              ref={scroller}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              style={styles.webDetailScroll}
              onContentSizeChange={(_width, height) => {
                contentHeight.value = height;
              }}
              onLayout={(event) => {
                portHeight.value = event.nativeEvent.layout.height;
                setPortReady(true);
              }}
              contentContainerStyle={styles.webDetailContent}>
              <View style={styles.body}>
                <ListingDetails card={card} actions={dealerSite} surface="buy" />
              </View>
            </Animated.ScrollView>
          </View>
        ) : (
          <>
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
              <View
                ref={photoPlateRef}
                style={[styles.photo, photoHeight ? { height: photoHeight } : styles.photoPending]}>
                <PhotoCarousel
                  photos={card.photos}
                  active={isTop}
                  index={photoIndex}
                  onIndexChange={setPhotoIndex}
                  showBars={false}
                  onExpand={openFullScreen}
                  measureRef={photoPlateRef}
                  alongside={panRef}
                />
                <PhotoCaption
                  card={card}
                  onExpand={isTop ? () => openFullScreen(photoIndex) : undefined}
                />
              </View>

              <View style={styles.body}>
                {/* Pass and save stay the swipe. Opening the dealer's page is
                    how you check the watch, so that button is on the card. */}
                <ListingDetails card={card} actions={dealerSite} surface="buy" />
              </View>
            </Animated.ScrollView>
          </>
        )}

        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}));

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
    paddingBottom: space.sm,
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
    // The photograph now carries the name, price, and year, so the
    // description opens the block under it.
    paddingTop: space.md,
  },
  webRow: {
    flex: 1,
    flexDirection: 'row' as const,
    minHeight: 0,
  },
  webPhotoColumn: {
    flex: 1,
    minWidth: 0,
  },
  webPhoto: {
    flex: 1,
    minHeight: 0,
    width: '100%' as const,
  },
  webDetailScroll: {
    flex: 1,
    minWidth: 0,
  },
  webDetailContent: {
    paddingBottom: space.sm,
  },
  // Over everything, on the card's own frame, so it never moves with the
  // scroll underneath it.
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: size.ring,
    borderRadius: radius.lg,
  },
});
