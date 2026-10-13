import * as Haptics from 'expo-haptics';
import { createContext, useContext, useMemo, useRef, type PropsWithChildren } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { inset, radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** How far a drag must travel before releasing it leaves the button open. */
const THRESHOLD = 40;

/**
 * Swipe a row left and a destructive button appears behind it. The gesture is
 * the one every list on the phone already uses, which is why the wishlist no
 * longer carries a line telling anyone how to remove a watch.
 *
 * The reveal only offers the action: the tap is what removes. A swipe that
 * deleted on its own would make the same flick that scrolls the list past a
 * row also throw it away.
 *
 * `ReanimatedSwipeable` is Gesture Handler's own, already a dependency, and it
 * runs the pan on the UI thread. Rolling this by hand would mean re-deriving
 * the parts that are easy to get wrong: the scroll-versus-swipe arbitration
 * inside a list, and closing the open row when another one opens.
 *
 * A swipe is not a gesture a screen reader can make, so this is never the only
 * way to remove something. On the wishlist, opening the watch gives the same action
 * as a button on the listing screen.
 */
export function SwipeToRemove({
  label = 'Remove',
  accessibilityLabel,
  onRemove,
  children,
}: PropsWithChildren<{
  label?: string;
  accessibilityLabel: string;
  onRemove: () => void;
}>) {
  const styles = useThemedStyles(swipeStyles);
  // True from the first pixel of the drag until the row is back at rest. A ref
  // rather than state: it is read inside a press handler at the moment of the
  // press, which is the only moment its value is worth anything.
  const moved = useRef(false);

  const remove = (swipeable: SwipeableMethods) => {
    swipeable.close();
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    onRemove();
  };

  return (
    <ReanimatedSwipeable
      friction={1.6}
      rightThreshold={THRESHOLD}
      overshootRight={false}
      // The row slides over the button, so it needs an opaque back of its own
      // or the red reads through the type.
      childrenContainerStyle={styles.row}
      onSwipeableOpenStartDrag={() => {
        moved.current = true;
      }}
      onSwipeableClose={() => {
        moved.current = false;
      }}
      renderRightActions={(_progress, _translation, swipeable) => (
        <View style={styles.panel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={() => remove(swipeable)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.label}>{label}</Text>
          </Pressable>
        </View>
      )}>
      <SwipeGuardContext.Provider value={moved}>{children}</SwipeGuardContext.Provider>
    </ReanimatedSwipeable>
  );
}

const SwipeGuardContext = createContext<{ current: boolean } | null>(null);

/**
 * Wraps a row's own press handlers so a drag never counts as a tap. React
 * Native Web fires the click at the end of a drag — without this, swiping a
 * row open also opened the watch. On iOS the gesture cancels the press by
 * itself, but a tap landing in the frame where the row is still travelling
 * would get through there too.
 *
 * Outside a `SwipeToRemove` this hands the handler straight back, so a row
 * that is not swipeable pays nothing for it.
 */
export function useSwipeGuard() {
  const moved = useContext(SwipeGuardContext);

  return useMemo(
    () =>
      <T extends ((...args: never[]) => void) | undefined>(handler: T): T => {
        if (!moved || !handler) return handler;
        return ((...args: never[]) => {
          if (moved.current) return;
          handler(...args);
        }) as T;
      },
    [moved]
  );
}

const swipeStyles = (theme: Theme) => ({
  row: {
    backgroundColor: theme.color.background,
  },
  panel: {
    justifyContent: 'center' as const,
    paddingLeft: space.lg,
  },
  button: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: inset.compactX,
    paddingVertical: inset.compactY,
    borderRadius: radius.full,
    backgroundColor: theme.color.danger,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    ...type.control,
    color: theme.color.onOverlay,
  },
});
