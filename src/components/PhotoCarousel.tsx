import { Image } from 'expo-image';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PhotoRollBars } from '@/components/PhotoRollBars';
import type { DeckPhoto } from '@/lib/models';
import { setPhotoLaunchRect } from '@/lib/photoLaunch';
import { motion, size, space, type, type Theme } from '@/lib/theme';
import { usePinchZoom } from '@/lib/zoom';
import { useThemedStyles } from '@/providers/theme';

/**
 * Tap the right of the photo for the next one, the left to go back — the same
 * grammar as every other card the user has met. On a deck card the roll wraps at
 * both ends. The full-screen viewer still stops at the first and last photo.
 *
 * On a card the photograph fills its frame edge to edge. A watch centred in a
 * band of matte reads as a broken image, and the crop costs less than the
 * letterbox: dealers shoot the watch in the middle of the frame.
 *
 * `viewer` is the same paging on a black field with the whole photograph in
 * frame. The roll sits on the photograph's top edge; equal flex above and
 * below centres that pair in the viewport, with height capped so both fit.
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
export function PhotoCarousel({
  photos,
  active,
  variant = 'card',
  initialIndex = 0,
  index: controlledIndex,
  onIndexChange,
  onExpand,
  alongside,
  showBars = variant === 'viewer',
  measureRef,
}: {
  photos: DeckPhoto[];
  active: boolean;
  variant?: 'card' | 'viewer';
  initialIndex?: number;
  /** Deck cards keep bars in `PhotoRollBars` above the photograph. */
  index?: number;
  onIndexChange?: (index: number) => void;
  onExpand?: (index: number) => void;
  showBars?: boolean;
  /** The card's swipe, which the pinch has to run with. See `usePinchZoom`. */
  alongside?: RefObject<GestureType | undefined>;
  /** Measured when opening the viewer — usually the photograph plate, not this view alone. */
  measureRef?: RefObject<View | null>;
}) {
  const styles = useThemedStyles(carouselStyles);
  const rootRef = useRef<View>(null);
  const [freeIndex, setFreeIndex] = useState(initialIndex);
  const index = controlledIndex ?? freeIndex;

  useEffect(() => {
    if (controlledIndex !== undefined) return;
    setFreeIndex(initialIndex);
  }, [controlledIndex, initialIndex]);

  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [shapes, setShapes] = useState<Record<string, number>>({});

  const current = photos[Math.min(index, photos.length - 1)];
  const next = photos[index + 1];
  const isViewer = variant === 'viewer';

  useEffect(() => {
    if (isViewer || !next?.url) return;
    void Image.prefetch(next.url);
  }, [isViewer, next?.url]);

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

  const ratio = current ? shapes[current.id] : undefined;
  const paged = photos.length > 1;
  const barsVisible = showBars && paged && (!isViewer || frame.width > 0);
  /** Roll plus the air between it and the photograph — reserved before sizing the image. */
  const viewerRollBand = barsVisible ? size.segment + space.sm : 0;

  const shownHeight =
    isViewer && ratio && frame.width
      ? Math.min(frame.height - viewerRollBand, frame.width / ratio)
      : ratio && frame.width
        ? Math.min(frame.height, frame.width / ratio)
        : 0;
  const viewerPhotoHeight =
    isViewer && shownHeight > 0
      ? shownHeight
      : isViewer && frame.height > 0
        ? Math.max(0, frame.height - viewerRollBand)
        : shownHeight > 0
          ? shownHeight
          : frame.height;

  const zoom = usePinchZoom({
    frame,
    content: isViewer
      ? { width: frame.width, height: viewerPhotoHeight }
      : frame,
    hold: isViewer,
    alongside,
    resetKey: current?.id,
  });

  if (!current) {
    return (
      <View style={[styles.photo, styles.empty]}>
        <Text style={styles.emptyLabel}>No photograph</Text>
      </View>
    );
  }

  const step = (by: number) => {
    if (photos.length <= 1) return;
    const nextIndex = (() => {
      const next = index + by;
      if (isViewer) return Math.min(Math.max(next, 0), photos.length - 1);
      if (next < 0) return photos.length - 1;
      if (next >= photos.length) return 0;
      return next;
    })();
    if (controlledIndex === undefined) setFreeIndex(nextIndex);
    onIndexChange?.(nextIndex);
  };

  const fireExpand = onExpand
    ? () => {
        const target = measureRef?.current ?? rootRef.current;
        target?.measureInWindow((x, y, width, height) => {
          setPhotoLaunchRect({ x, y, width, height });
          onExpand(index);
        });
      }
    : undefined;

  const image = (
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
              const aspect = source.width / source.height;
              setShapes((known) => (known[id] ? known : { ...known, [id]: aspect }));
            }
          : undefined
      }
    />
  );

  const zones = active ? (
    <View style={styles.zones} pointerEvents={zoom.zoomed ? 'none' : 'auto'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paged ? 'Previous photo' : 'Photo'}
        accessibilityValue={paged ? { text: `${index + 1} of ${photos.length}` } : undefined}
        accessibilityHint={fireExpand ? 'Long press to see it full screen' : undefined}
        style={styles.zone}
        onPress={paged ? () => step(-1) : undefined}
        onLongPress={fireExpand}
      />
      {paged ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next photo"
          accessibilityValue={{ text: `${index + 1} of ${photos.length}` }}
          accessibilityHint={fireExpand ? 'Long press to see it full screen' : undefined}
          style={styles.zone}
          onPress={() => step(1)}
          onLongPress={fireExpand}
        />
      ) : null}
    </View>
  ) : null;

  if (isViewer) {
    return (
      <GestureDetector gesture={zoom.gesture}>
        <View
          ref={rootRef}
          style={[styles.photo, styles.viewer, styles.viewerRoot]}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setFrame((size) =>
              size.width === width && size.height === height ? size : { width, height },
            );
          }}>
          <View style={styles.viewerStack}>
            <View style={styles.viewerSpacer} />
            <View style={styles.viewerBlock}>
              {barsVisible ? (
                <PhotoRollBars photos={photos} index={index} placement="viewer" />
              ) : null}
              <Animated.View
                style={[
                  {
                    width: frame.width || undefined,
                    height: viewerPhotoHeight || undefined,
                    alignSelf: 'center' as const,
                  },
                  zoom.style,
                ]}>
                {image}
              </Animated.View>
            </View>
            <View style={styles.viewerSpacer} />
          </View>
          {zones}
        </View>
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={zoom.gesture}>
      <View
        ref={rootRef}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setFrame((size) => (size.width === width && size.height === height ? size : { width, height }));
        }}
        style={styles.photo}>
        <Animated.View style={[StyleSheet.absoluteFill, zoom.style]}>{image}</Animated.View>

        {barsVisible && !isViewer ? (
          <View style={styles.rollOnPhoto} pointerEvents="none">
            <PhotoRollBars photos={photos} index={index} placement="deck" />
          </View>
        ) : null}

        {zones}
      </View>
    </GestureDetector>
  );
}

const carouselStyles = (theme: Theme) => ({
  photo: {
    flex: 1,
    backgroundColor: theme.color.surfaceSunken,
    overflow: 'hidden' as const,
  },
  viewer: {
    backgroundColor: '#000000',
  },
  viewerRoot: {
    flex: 1,
  },
  viewerStack: {
    flex: 1,
    flexDirection: 'column' as const,
  },
  viewerSpacer: {
    flex: 1,
    minHeight: 0,
  },
  viewerBlock: {
    width: '100%' as const,
    alignItems: 'center' as const,
  },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  rollOnPhoto: {
    position: 'absolute' as const,
    top: space.sm,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
    zIndex: 2,
  },
  zones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row' as const,
  },
  zone: {
    flex: 1,
  },
});
