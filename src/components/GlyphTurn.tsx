import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/lib/theme';

type Glyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** How far each glyph turns as it hands over. A quarter turn reads as a flip. */
const TURN = 90;
/** How much the leaving glyph shrinks on its way out, and the arriving one grows. */
const SHRINK = 0.3;

/**
 * One glyph becoming another: a quarter turn and a cross-fade, `motion.fast`,
 * on the UI thread. It reads as the control changing its mind, which is what
 * happened. Swapping the icon on the frame the state changes is the same
 * information delivered as a flicker.
 *
 * Starts at rest. A control that mounts already `on` shows the second glyph
 * and nothing turns; a turn on mount would announce a change nobody made.
 */
export function GlyphTurn({
  on,
  from,
  to,
  size,
  color,
}: {
  /** `from` shows while false, `to` while true. */
  on: boolean;
  from: Glyph;
  to: Glyph;
  size: number;
  color: string;
}) {
  // 0 while the first glyph shows, 1 while the second does.
  const turn = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    turn.value = withTiming(on ? 1 : 0, { duration: motion.fast });
  }, [on, turn]);

  const leaving = useAnimatedStyle(() => ({
    opacity: 1 - turn.value,
    transform: [{ rotate: `${turn.value * TURN}deg` }, { scale: 1 - turn.value * SHRINK }],
  }));

  const arriving = useAnimatedStyle(() => ({
    opacity: turn.value,
    transform: [
      { rotate: `${(turn.value - 1) * TURN}deg` },
      { scale: 1 - SHRINK + turn.value * SHRINK },
    ],
  }));

  return (
    <View style={{ width: size, height: size }} accessible={false}>
      {/* Stacked, so neither glyph moves the other while they trade places. */}
      <Animated.View style={[styles.glyph, leaving]}>
        <MaterialCommunityIcons name={from} size={size} color={color} />
      </Animated.View>
      <Animated.View style={[styles.glyph, arriving]}>
        <MaterialCommunityIcons name={to} size={size} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
