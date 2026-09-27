import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion, size, space } from '@/lib/theme';
import { useTheme } from '@/providers/theme';

const WATCHES = [
  require('../../../assets/sign-in/rolex-day-date.png'),
  require('../../../assets/sign-in/patek-nautilus.png'),
  require('../../../assets/sign-in/omega-seamaster.png'),
  require('../../../assets/sign-in/audemars-piguet.png'),
];

/**
 * Four photographs beside the wordmark, one at a time. Decorative: the word
 * already names the screen, and announcing a watch here would sound like a
 * listing. The interval changes which one is shown. The fade is Reanimated,
 * so the swap itself does not go through React on every frame.
 */
export function WordmarkWatches({ height }: { height: number }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const edge = theme.color.background;

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (live) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % WATCHES.length);
    }, motion.rotate);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <View
      style={[styles.frame, { height }]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {WATCHES.map((source, i) => (
        <Watch key={i} source={source} shown={i === index} />
      ))}
      <LinearGradient
        colors={[edge, 'transparent']}
        style={styles.fadeTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', edge]}
        style={styles.fadeBottom}
        pointerEvents="none"
      />
    </View>
  );
}

function Watch({ source, shown }: { source: number; shown: boolean }) {
  const opacity = useSharedValue(shown ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(shown ? 1 : 0, { duration: motion.base });
  }, [opacity, shown]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" accessible={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: size.wordmarkWatchWidth,
    overflow: 'hidden' as const,
  },
  fadeTop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: space.md,
  },
  fadeBottom: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: space.md,
  },
});
