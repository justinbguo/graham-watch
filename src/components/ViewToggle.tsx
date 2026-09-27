import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import { HIT_TARGET, motion, size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export type DeckView = 'cards' | 'grid';

/** How far each glyph turns as it hands over. A quarter turn reads as a flip. */
const TURN = 90;

/**
 * One button, showing where the tap goes rather than where you are: on cards it
 * offers the grid, on the grid it offers cards. Two glyphs side by side meant
 * one of them was always the answer to a question nobody asked, and a lit one
 * beside a faint one is a segmented control drawn without its frame.
 *
 * The swap is a quarter turn and a cross-fade between the two glyphs, on the
 * UI thread. It reads as the control changing its mind, which is what happened
 * — the alternative, replacing the icon on the frame the state changes, is the
 * same information delivered as a flicker.
 */
export function ViewToggle({
  value,
  onChange,
}: {
  value: DeckView;
  onChange: (next: DeckView) => void;
}) {
  const styles = useThemedStyles(toggleStyles);
  const theme = useTheme();
  const showsGrid = value === 'cards';

  // 0 while the button offers the grid, 1 while it offers the cards.
  const turn = useDerivedValue(() =>
    withTiming(showsGrid ? 0 : 1, { duration: motion.fast })
  );

  const grid = useAnimatedStyle(() => ({
    opacity: 1 - turn.value,
    transform: [{ rotate: `${turn.value * TURN}deg` }, { scale: 1 - turn.value * 0.3 }],
  }));

  const cards = useAnimatedStyle(() => ({
    opacity: turn.value,
    transform: [{ rotate: `${(turn.value - 1) * TURN}deg` }, { scale: 0.7 + turn.value * 0.3 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      // The label is the destination, so it stays true as the glyph turns.
      accessibilityLabel={showsGrid ? 'Grid' : 'One at a time'}
      onPress={() => onChange(showsGrid ? 'grid' : 'cards')}
      style={styles.button}>
      <Animated.View style={[styles.glyph, grid]}>
        <MaterialCommunityIcons
          name="view-grid-outline"
          size={size.icon}
          color={theme.color.text}
        />
      </Animated.View>
      <Animated.View style={[styles.glyph, cards]}>
        <MaterialCommunityIcons name="cards-outline" size={size.icon} color={theme.color.text} />
      </Animated.View>
    </Pressable>
  );
}

const toggleStyles = (_theme: Theme) => ({
  button: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Stacked, so neither glyph moves the other while they trade places.
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
