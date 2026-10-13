import { Image } from 'expo-image';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type RefObject,
} from 'react';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DeckPhoto } from '@/lib/models';
import { motion, scrimTop, size, space, type, type Theme } from '@/lib/theme';
import { usePinchZoom } from '@/lib/zoom';
import { useThemedStyles } from '@/providers/theme';

export type PhotoCarouselHandle = {
  /** Step through the roll. Positive is forward; paging never wraps. */
  step: (by: number) => void;
};

/**
 * Tap the right of the photo for the next one, the left to go back — the same
 * grammar as every other card the user has met. Paging never wraps: reaching the
 * last photo and landing back on the first reads as a glitch.
 *
 * On a card the photograph fills its frame edge to edge. A watch centred in a
 * band of matte reads as a broken image, and the crop costs less than the
 * letterbox: dealers shoot the watch in the middle of the frame.
 *
 * `viewer` is the same paging on a black field with the whole photograph in
 * frame, for the full-screen route. That is where nothing may be cropped.
 *
 * Either way a pinch magnifies the photograph — the dial's printing, the
 * crown, the stretch in a bracelet are what a buyer is looking for and they are
 * smaller than the words beside them. On a card the zoom springs back when the
 * fingers lift; in the viewer it is held, and a double tap is the way in and
 * back out.
 *
 * expo-image rather than React Native's Image because these are large dealer
 * photographs and it caches them to disk; RN's Image only caches in memory, so
 * every return to a card would refetch.
 */
export const PhotoCarousel = forwardRef<
  PhotoCarouselHandle,
  {
    photos: DeckPhoto[];
    active: boolean;
    variant?: 'card' | 'viewer';
    initialIndex?: number;
    onExpand?: (index: number) => void;
    /** The card's swipe, which the pinch has to run with. See `usePinchZoom`. */
    alongside?: RefObject<GestureType | undefined>;
  }
>(function PhotoCarousel(
  { photos, active, variant = 'card', initialIndex = 0, onExpand, alongside },
  ref
) {
  const styles = useThemedStyles(carouselStyles);
  // A card sits inside a screen that already handled the notch; the viewer fills
  // the display, so it keeps its own bars clear of the status bar.
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  // The viewer shows the whole photograph, so black stands above and below one
  // that is not the window's shape. The bars belong on the photograph's own top
  // edge, which takes the frame and the photograph's proportions to find.
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [shapes, setShapes] = useState<Record<string, number>>({});

  const current = photos[Math.min(index, photos.length - 1)];
  const next = photos[index + 1];
  const isViewer = variant === 'viewer';

  const step = (by: number) =>
    setIndex((value) => Math.min(Math.max(value + by, 0), Math.max(photos.length - 1, 0)));

  useImperativeHandle(ref, () => ({ step }), [photos.length]);

  // Warm the next photo while this one is still being looked at.
  useEffect(() => {
    if (isViewer || !next?.url) return;
    void Image.prefetch(next.url);
  }, [isViewer, next?.url]);

  // In the viewer a photograph's proportions decide where the bars sit, so
  // they have to be known before it is shown. `onLoad` reports them a frame
  // late, which sent the bars to the status bar and then dropped them onto the
  // photograph on every tap forward. `loadAsync` reads the same shape ahead of
  // the render — and loads the bytes, so it warms the next photo as well.
  useEffect(() => {
    if (!isViewer) return;
    let alive = true;

    const learn = async (photo?: DeckPhoto) => {
      if (!photo?.url) return;
      try {
        const loaded = await Image.loadAsync(photo.url);
        if (!alive || !loaded?.width || !loaded?.height) return;
        const ratio = loaded.width / loaded.height;
        setShapes((known) => (known[photo.id] ? known : { ...known, [photo.id]: ratio }));
      } catch {
        // `onLoad` below is the second source, for when the load fails here.
      }
    };

    void learn(current);
    void learn(next);
    return () => {
      alive = false;
    };
  }, [isViewer, current?.id, current?.url, next?.id, next?.url]);

  // How much of the frame the photograph covers. Under `cover` it is the whole
  // frame; under `contain` it is less, and a zoom has to stop panning at the
  // photograph's edge rather than at the window's.
  const ratio = current ? shapes[current.id] : undefined;
  const shownHeight = ratio && frame.width ? Math.min(frame.height, frame.width / ratio) : 0;
  const shownWidth = ratio && frame.height ? Math.min(frame.width, frame.height * ratio) : 0;

  const zoom = usePinchZoom({
    frame,
    content: isViewer ? { width: shownWidth, height: shownHeight } : frame,
    hold: isViewer,
    alongside,
  });

  if (!current) {
    return (
      <View style={[styles.photo, styles.empty]}>
        <Text style={styles.emptyLabel}>No photograph</Text>
      </View>
    );
  }

  const expand = onExpand ? () => onExpand(index) : undefined;
  const paged = photos.length > 1;

  // Where the photograph's own top edge is. `contain` centres it, so half the
  // leftover height is the black above it. Never higher than the status bar: a
  // portrait photograph fills the window and its top edge is under the island.
  const barsTop = shownHeight ? Math.max((frame.height - shownHeight) / 2, insets.top) : insets.top;
  // A photograph of unknown shape has no top edge to sit on yet. The bars wait
  // for it rather than start at the status bar and move: arriving with the
  // photograph reads as one thing appearing, moving afterwards reads as a fault.
  const showBars = paged && (!isViewer || shownHeight > 0);

  return (
    // The detector holds the whole frame rather than the photograph alone: the
    // paging zones lie over the photograph, and a gesture attached underneath
    // them never saw a finger.
    <GestureDetector gesture={zoom.gesture}>
      <View
        // Both variants measure. The viewer needs the frame to place its bars,
        // and a pinch magnifies about a point measured from the frame's middle.
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setFrame((size) => (size.width === width && size.height === height ? size : { width, height }));
        }}
        style={[styles.photo, isViewer && styles.viewer]}>
        <Animated.View style={[StyleSheet.absoluteFill, zoom.style]}>
          <Image
            source={{ uri: current.url }}
            style={StyleSheet.absoluteFill}
            contentFit={isViewer ? 'contain' : 'cover'}
            transition={motion.fast}
            recyclingKey={current.id}
            onLoad={
              isViewer
                ? ({ source }) => {
                    if (!source?.width || !source?.height) return;
                    const id = current.id;
                    const ratio = source.width / source.height;
                    setShapes((known) => (known[id] ? known : { ...known, [id]: ratio }));
                  }
                : undefined
            }
          />
        </Animated.View>

        {/* One bar per photograph, along the very top edge of the photograph, the
            grammar every phone owner already knows for "there are more of these".
            The bars sit on a shallow fade because half these watches are shot on
            white and a white rule on a white wall is not there. */}
        {showBars ? (
          <View
            style={[styles.segments, topFade, isViewer && { top: barsTop }]}
            pointerEvents="none">
            {photos.map((photo, at) => (
              <View key={photo.id} style={[styles.segment, at === index && styles.segmentOn]} />
            ))}
          </View>
        ) : null}

        {/* Only the top card takes taps; a card underneath is not being read. The
            zones exist even for a lone photo, because the long press does not
            need a second one to be worth offering. They are off while the
            photograph is magnified: a finger lifting out of a pinch lands in a
            zone and pages the roll. */}
        {active ? (
          <View style={styles.zones} pointerEvents={zoom.zoomed ? 'none' : 'auto'}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={paged ? 'Previous photo' : 'Photo'}
              // The bars are drawn, not spoken. Where you are in the roll rides
              // on the controls that move through it instead.
              accessibilityValue={paged ? { text: `${index + 1} of ${photos.length}` } : undefined}
              accessibilityHint={expand ? 'Long press to see it full screen' : undefined}
              style={styles.zone}
              onPress={paged ? () => step(-1) : undefined}
              onLongPress={expand}
            />
            {paged ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                accessibilityValue={{ text: `${index + 1} of ${photos.length}` }}
                accessibilityHint={expand ? 'Long press to see it full screen' : undefined}
                style={styles.zone}
                onPress={() => step(1)}
                onLongPress={expand}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
});

/** Same gradient, two style keys: Fabric's prop, and the CSS name on web. */
const topFade = Platform.select<ViewStyle>({
  web: { backgroundImage: scrimTop } as ViewStyle,
  default: { experimental_backgroundImage: scrimTop },
});

const carouselStyles = (theme: Theme) => ({
  photo: {
    flex: 1,
    backgroundColor: theme.color.surfaceSunken,
    overflow: 'hidden' as const,
  },
  // Black in both themes. A photograph shown whole needs a field that does not
  // compete with it, and a light one reads as an unfinished screen.
  viewer: {
    backgroundColor: '#000000',
  },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  segments: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    gap: space.xs,
    paddingTop: space.sm,
    paddingHorizontal: space.sm,
    // Room for the fade to end in, below the bars themselves.
    paddingBottom: space.xl,
    zIndex: 2,
  },
  segment: {
    flex: 1,
    height: size.segment,
    backgroundColor: theme.color.onOverlayFaint,
  },
  // Tan, not white. Everything else on a photograph is white, so the mark that
  // says which photo you are on is the one thing that is not.
  segmentOn: {
    backgroundColor: theme.color.onOverlayAccent,
  },
  zones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row' as const,
  },
  zone: {
    flex: 1,
  },
});
