import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsDesktopWeb, useIsWide } from '@/lib/layout';
import { size } from '@/lib/theme';

/**
 * How far the keyboard covers the bottom of the window, minus whatever is
 * already standing there — a home-indicator inset, a tab bar, or both.
 *
 * `KeyboardAvoidingView` adds the whole keyboard on top of that, which lands
 * the control it is lifting either under the keys or a bar's height above
 * them. The frame event reports where the keys actually are, and `below` is
 * what the caller has already paid for.
 *
 * Returns 0 on the web, where there is no keyboard event and the browser
 * scrolls the field into view itself.
 */
export function useKeyboardOverlap(below = 0) {
  const { height: windowHeight } = useWindowDimensions();
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    // iOS reports the frame before the keyboard moves, so the layout changes
    // with it. Android has no `will` events and reports it after.
    const frameEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const frame = Keyboard.addListener(frameEvent, (event) => {
      const covered = windowHeight - event.endCoordinates.screenY;
      setOverlap(Math.max(0, covered - below));
    });
    const hide = Keyboard.addListener(hideEvent, () => setOverlap(0));
    return () => {
      frame.remove();
      hide.remove();
    };
  }, [below, windowHeight]);

  return overlap;
}

/**
 * How far to lift a control pinned to the bottom of a screen, once the
 * keyboard is up. Pad the screen by it.
 *
 * `inTabs` because the tab bar stands in the home-indicator strip on a phone
 * and the keyboard covers the bar as well, so a screen inside the tabs has
 * that much less to make up. On a wide window the rail is on the left and
 * `Screen` pays the bottom inset itself.
 */
export function useKeyboardLift(inTabs = false) {
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const isDesktopWeb = useIsDesktopWeb();
  const standing =
    inTabs && !isWide && !isDesktopWeb ? size.tabBar + insets.bottom : insets.bottom;
  return useKeyboardOverlap(standing);
}
