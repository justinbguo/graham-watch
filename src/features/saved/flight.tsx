import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion, radius, saveFlightDuration, size, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * A saved watch travels to the Wishlist tab instead of leaving the screen. A right
 * swipe files the watch somewhere the user can go and find it, and the flight
 * is the only thing that says where in the moment; the count on the tab is
 * what says it afterwards.
 *
 * The copy flies in an overlay above the tab bar rather than inside the deck,
 * so the deck can retire the real card in the same frame. Holding the next card
 * back until the animation finished would make every save feel slower than the
 * swipe that caused it.
 */

export type Rect = { x: number; y: number; width: number; height: number };

type Flight = { id: number; from: Rect; to: Rect; photo?: string };

type SaveFlightState = {
  /** The Wishlist tab reports where it sits. Without it there is nowhere to fly. */
  registerTarget: (rect: Rect) => void;
  launch: (origin: { from: Rect; photo?: string }) => void;
  /** Bumped as each card lands, so the tab can answer for itself. */
  arrivals: SharedValue<number>;
};

/** Small enough to read as filed away, large enough to still be a card on the way. */
const MIN_SCALE = 0.08;
const PULSE_SCALE = 0.18;

const SaveFlightContext = createContext<SaveFlightState | null>(null);

export function SaveFlightProvider({ children }: PropsWithChildren) {
  const target = useRef<Rect | null>(null);
  const lastId = useRef(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const arrivals = useSharedValue(0);

  const registerTarget = useCallback((rect: Rect) => {
    target.current = rect;
  }, []);

  const launch = useCallback(({ from, photo }: { from: Rect; photo?: string }) => {
    const to = target.current;
    // A save is never blocked on the animation being possible: if the tab has
    // not reported a position yet, the watch is still saved, it just goes
    // quietly.
    if (!to || from.width <= 0) return;

    lastId.current += 1;
    const id = lastId.current;
    setFlights((current) => [...current, { id, from, to, photo }]);
  }, []);

  const land = useCallback((id: number) => {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);

  const value = useMemo(
    () => ({ registerTarget, launch, arrivals }),
    [registerTarget, launch, arrivals]
  );

  return (
    <SaveFlightContext.Provider value={value}>
      <View style={overlayStyles.root}>
        {children}

        {/* Above the tab bar so the card lands on the tab rather than behind
            it, and never in the way of the next swipe. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {flights.map((flight) => (
            <FlyingCard key={flight.id} flight={flight} arrivals={arrivals} onLanded={land} />
          ))}
        </View>
      </View>
    </SaveFlightContext.Provider>
  );
}

export function useSaveFlight() {
  const context = useContext(SaveFlightContext);
  if (!context) throw new Error('useSaveFlight must be used inside SaveFlightProvider.');
  return context;
}

const centerX = (rect: Rect) => rect.x + rect.width / 2;
const centerY = (rect: Rect) => rect.y + rect.height / 2;

/**
 * The photograph alone, cropped as the card cropped it so the handoff is not a
 * reframe. The name and price go unreadable within a frame of the shrink, so
 * carrying them would cost a measure and a second copy of the summary for
 * nothing.
 */
function FlyingCard({
  flight,
  arrivals,
  onLanded,
}: {
  flight: Flight;
  arrivals: SharedValue<number>;
  onLanded: (id: number) => void;
}) {
  const styles = useThemedStyles(flightStyles);
  const progress = useSharedValue(0);

  const travelX = centerX(flight.to) - centerX(flight.from);
  const travelY = centerY(flight.to) - centerY(flight.from);
  const endScale = Math.max(flight.to.width / flight.from.width, MIN_SCALE);

  useEffect(() => {
    const web = Platform.OS === 'web';
    progress.value = withTiming(
      1,
      { duration: saveFlightDuration(flight.from.width, web), easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        arrivals.value += 1;
        scheduleOnRN(onLanded, flight.id);
      }
    );
  }, [progress, arrivals, onLanded, flight.id]);

  // Translate before scale: the other order would shrink the distance travelled
  // along with the card and drop it short of the tab.
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * travelX },
      { translateY: progress.value * travelY },
      { scale: interpolate(progress.value, [0, 1], [1, endScale]) },
    ],
    opacity: interpolate(progress.value, [0, 0.7, 1], [1, 0.9, 0]),
  }));

  return (
    <Animated.View
      style={[
        styles.card,
        {
          left: flight.from.x,
          top: flight.from.y,
          width: flight.from.width,
          height: flight.from.height,
        },
        style,
      ]}>
      {flight.photo ? (
        <Image source={{ uri: flight.photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
    </Animated.View>
  );
}

/**
 * Reports where the Wishlist tab sits so a save can fly there. The desktop
 * header uses text pills instead of `SaveTargetIcon`, but the flight still
 * needs a measured target.
 */
export function SaveFlightTarget({ children }: { children: ReactNode }) {
  const { registerTarget, arrivals } = useSaveFlight();
  const frame = useRef<View>(null);
  const pulse = useSharedValue(0);

  const measure = useCallback(() => {
    frame.current?.measureInWindow((x, y, width, height) => {
      if (!width) return;
      registerTarget({ x, y, width, height });
    });
  }, [registerTarget]);

  useEffect(() => {
    const handle = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(handle);
  }, [measure]);

  useAnimatedReaction(
    () => arrivals.value,
    (count, previous) => {
      if (previous === null || count === previous) return;
      pulse.value = withSequence(
        withTiming(1, { duration: motion.fast / 2 }),
        withTiming(0, { duration: motion.fast })
      );
    }
  );

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * PULSE_SCALE }],
  }));

  return (
    <Animated.View ref={frame} collapsable={false} onLayout={measure} style={pulseStyle}>
      {children}
    </Animated.View>
  );
}

/** Bottom or side tab bar: bookmark glyph that registers the flight target. */
export function SaveTargetIcon({ color }: { color: ColorValue }) {
  return (
    <SaveFlightTarget>
      <MaterialCommunityIcons name="bookmark-outline" size={size.tabIcon} color={color} />
    </SaveFlightTarget>
  );
}

const overlayStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

const flightStyles = (theme: Theme) => ({
  card: {
    position: 'absolute' as const,
    backgroundColor: theme.color.surfaceSunken,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
  },
});
