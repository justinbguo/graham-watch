import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { PhotoRect } from '@/lib/photoLaunch';
import { motion, radius } from '@/lib/theme';

/**
 * Grows the photograph from the card's measured frame into the viewer. The
 * stack's modal animation is off so this is the only entrance.
 */
export function PhotoZoomEnter({
  from,
  uri,
  onDone,
}: {
  from: PhotoRect;
  uri: string;
  onDone: () => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const progress = useSharedValue(0);
  const done = useRef(false);

  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: motion.base, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (!finished || done.current) return;
        done.current = true;
        runOnJS(onDone)();
      },
    );
  }, [onDone, progress]);

  const frame = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      left: from.x + (0 - from.x) * t,
      top: from.y + (0 - from.y) * t,
      width: from.width + (screenW - from.width) * t,
      height: from.height + (screenH - from.height) * t,
      borderRadius: radius.lg * (1 - t),
    };
  });

  const scrim = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.scrim, scrim]} />
      <Animated.View style={[styles.flyer, frame]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  flyer: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
});
