import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { photoScrollPage } from '@/lib/photoPager';
import { photoWheelStep } from '@/lib/photoWheel';
import type { DeckPhoto } from '@/lib/models';
import { motion, size, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const DRAG_SLOP = 6;

/**
 * Multi-photo grid frame on web. DOM pointer listeners with capture follow the
 * mouse after press, and `touch-action: none` keeps the grid list from taking
 * the gesture. React Native's pan responder does not reliably drive mouse drag
 * on web inside a virtualized list.
 */
export function GridPhotoStrip({
  photos,
  width,
  height,
  contentFit,
  page,
  onPageChange,
  onPress,
}: {
  photos: DeckPhoto[];
  width: number;
  height: number;
  contentFit: 'cover' | 'contain';
  page: number;
  onPageChange: (index: number) => void;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(stripStyles);
  const hostRef = useRef<View>(null);
  const offsetX = useSharedValue(-page * width);
  const dragging = useRef(false);
  const moved = useRef(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const lastSample = useRef({ x: 0, t: 0 });
  const pageRef = useRef(page);
  const widthRef = useRef(width);
  const countRef = useRef(photos.length);
  const wheelAccum = useRef(0);
  const wheelLock = useRef(false);
  pageRef.current = page;
  widthRef.current = width;
  countRef.current = photos.length;

  useEffect(() => {
    if (dragging.current) return;
    offsetX.value = withTiming(-page * width, { duration: motion.fast });
  }, [offsetX, page, width]);

  const snapTo = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), countRef.current - 1);
    onPageChange(clamped);
  };

  const clampOffset = (value: number) => {
    const w = widthRef.current;
    const min = -(countRef.current - 1) * w;
    return Math.min(Math.max(value, min), 0);
  };

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || width <= 0) return;
    const el = hostRef.current as unknown as HTMLElement | null;
    if (!el) return;

    const finish = (endX: number) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (!moved.current) return;

      const dt = Math.max(Date.now() - lastSample.current.t, 1) / 1000;
      const velocityX = (endX - lastSample.current.x) / dt;
      const w = widthRef.current;
      const projected = -offsetX.value - velocityX * 0.15;
      const next = photoScrollPage(projected, w, countRef.current);
      offsetX.value = withTiming(-next * w, { duration: motion.fast });
      snapTo(next);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging.current = true;
      moved.current = false;
      startX.current = event.clientX;
      startOffset.current = offsetX.value;
      lastSample.current = { x: event.clientX, t: Date.now() };
      el.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const dx = event.clientX - startX.current;
      if (Math.abs(dx) <= DRAG_SLOP) return;
      moved.current = true;
      event.preventDefault();
      event.stopPropagation();
      offsetX.value = clampOffset(startOffset.current + dx);
      lastSample.current = { x: event.clientX, t: Date.now() };
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
      finish(event.clientX);
    };

    const onWheel = (event: WheelEvent) => {
      const step = photoWheelStep(event.deltaX, event.deltaY, wheelAccum.current);
      if (!step.horizontal) return;
      event.preventDefault();
      wheelAccum.current = step.nextAccumulated;
      if (wheelLock.current || step.direction === 0) return;
      wheelLock.current = true;
      wheelAccum.current = 0;
      snapTo(pageRef.current + step.direction);
      window.setTimeout(() => {
        wheelLock.current = false;
        wheelAccum.current = 0;
      }, motion.base);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [offsetX, onPageChange, photos.length, width]);

  const stripStyle = useAnimatedStyle(() => ({
    width: width * photos.length,
    height,
    flexDirection: 'row' as const,
    transform: [{ translateX: offsetX.value }],
  }));

  const openUnlessDragged = () => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    onPress?.();
  };

  if (Platform.OS !== 'web') return null;

  return (
    <Pressable
      ref={hostRef}
      onPress={openUnlessDragged}
      style={[styles.clip, styles.noDrag, { width, height }]}
      accessibilityRole="adjustable"
      accessibilityLabel="Listing photos"
      accessibilityValue={{ text: `${page + 1} of ${photos.length}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') snapTo(page + 1);
        if (event.nativeEvent.actionName === 'decrement') snapTo(page - 1);
      }}>
      <Animated.View style={stripStyle} pointerEvents="none">
        {photos.map((photo) => (
          <View key={photo.id} style={{ width, height }}>
            <Image
              source={{ uri: photo.url }}
              style={styles.fill}
              contentFit={contentFit}
              accessible={false}
            />
          </View>
        ))}
      </Animated.View>
      <View pointerEvents="none" style={styles.bars}>
        {photos.map((photo, index) => (
          <View key={photo.id} style={[styles.bar, index === page && styles.barOn]} />
        ))}
      </View>
    </Pressable>
  );
}

const stripStyles = (theme: Theme) => ({
  clip: {
    overflow: 'hidden' as const,
    touchAction: 'pan-y' as const,
  },
  fill: {
    width: '100%' as const,
    height: '100%' as const,
  },
  noDrag: {
    userSelect: 'none' as const,
    cursor: 'pointer' as const,
  },
  bars: {
    position: 'absolute' as const,
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    flexDirection: 'row' as const,
    gap: space.xs,
  },
  bar: {
    flex: 1,
    height: size.segment,
    backgroundColor: theme.color.textFaint,
  },
  barOn: {
    backgroundColor: theme.color.text,
  },
});
