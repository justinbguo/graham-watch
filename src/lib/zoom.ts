import { type RefObject, useState } from 'react';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion } from '@/lib/theme';

/** As far in as a pinch may go. Past this a dealer's photograph is pixels. */
const MAX_SCALE = 4;
/** Where a double tap lands: a dial filling the frame. */
const TAP_SCALE = 2.5;
/** Anything under this is not a zoom, so it goes back to rest. */
const REST = 1.02;

type Box = { width: number; height: number };

/**
 * Pinch a photograph to look closer. The gesture runs in Reanimated worklets
 * on the UI thread — a magnification driven by React state would drop frames
 * on exactly the interaction that exists to be looked at closely.
 *
 * `hold` is the difference between the two places this is used. On a card the
 * zoom springs back when the fingers lift: the card is in a deck waiting to be
 * swiped, and one left magnified would be a card that no longer behaves like
 * the rest. In the full-screen viewer the zoom stays, because you opened that
 * screen to study the watch, and a magnification you have to keep two fingers
 * on is one you cannot look at.
 *
 * `frame` is the window the photograph shows through; `content` is how much of
 * it the photograph actually covers, which is the frame under `cover` and less
 * than the frame under `contain`. Panning is bounded by the content, so the
 * photograph's own edge never comes inside the window.
 *
 * `alongside` is a gesture on an ancestor that the pinch runs with rather
 * than against: the deck card's swipe. Without it whichever activates first
 * cancels the other, and the first finger nearly always moves before the
 * second lands, so the swipe won and the pinch never started.
 */
export function usePinchZoom({
  frame,
  content,
  hold = false,
  alongside,
}: {
  frame: Box;
  content?: Box;
  hold?: boolean;
  alongside?: RefObject<GestureType | undefined>;
}) {
  const scale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  // Where the gesture began, so a second pinch continues the first instead of
  // restarting from rest.
  const from = useSharedValue({ scale: 1, x: 0, y: 0, focalX: 0, focalY: 0 });
  // The one piece of this the render tree needs: while a photograph is
  // magnified the paging taps underneath it are off, or a finger lifting from
  // a pinch advances the roll. Set twice per gesture, not per frame.
  const [zoomed, setZoomed] = useState(false);

  const box = content?.width && content?.height ? content : frame;
  const settle = { duration: motion.settle, easing: Easing.out(Easing.cubic) };

  const limitX = (at: number) => {
    'worklet';
    return Math.max((box.width * at - frame.width) / 2, 0);
  };
  const limitY = (at: number) => {
    'worklet';
    return Math.max((box.height * at - frame.height) / 2, 0);
  };
  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(Math.max(value, -limit), limit);
  };

  /**
   * Magnify about a point and leave what was under it there. A pinch that
   * scales about the frame's middle slides the part you were looking at out
   * from under your fingers.
   */
  const zoomAbout = (next: number, focalX: number, focalY: number) => {
    'worklet';
    const was = from.value;
    const ratio = next / was.scale;
    scale.value = next;
    offsetX.value = clamp(focalX - (focalX - was.x) * ratio, limitX(next));
    offsetY.value = clamp(focalY - (focalY - was.y) * ratio, limitY(next));
  };

  const rest = () => {
    'worklet';
    scale.value = withTiming(1, settle);
    offsetX.value = withTiming(0, settle);
    offsetY.value = withTiming(0, settle);
    scheduleOnRN(setZoomed, false);
  };

  const begin = (focalX: number, focalY: number) => {
    'worklet';
    from.value = {
      scale: scale.value,
      x: offsetX.value,
      y: offsetY.value,
      // Measured from the frame's middle, which is what the scale transform
      // grows away from.
      focalX: focalX - frame.width / 2,
      focalY: focalY - frame.height / 2,
    };
  };

  const pinch = Gesture.Pinch();
  if (alongside) pinch.simultaneousWithExternalGesture(alongside);
  pinch
    .onStart((event) => {
      begin(event.focalX, event.focalY);
      scheduleOnRN(setZoomed, true);
    })
    .onUpdate((event) => {
      const next = Math.min(Math.max(from.value.scale * event.scale, 1), MAX_SCALE);
      zoomAbout(next, from.value.focalX, from.value.focalY);
    })
    .onEnd(() => {
      if (!hold || scale.value <= REST) {
        rest();
        return;
      }
      // Kept, but pulled back inside its own edges: the pinch may have ended
      // with the photograph held off centre.
      offsetX.value = withTiming(clamp(offsetX.value, limitX(scale.value)), settle);
      offsetY.value = withTiming(clamp(offsetY.value, limitY(scale.value)), settle);
    });

  // One finger moves a photograph that is already magnified. Only where the
  // zoom is held: on a card that same finger is the swipe.
  const drag = Gesture.Pan()
    .enabled(hold && zoomed)
    .onChange((event) => {
      offsetX.value = clamp(offsetX.value + event.changeX, limitX(scale.value));
      offsetY.value = clamp(offsetY.value + event.changeY, limitY(scale.value));
    });

  // The way out of a held zoom, and the way in without two fingers.
  const doubleTap = Gesture.Tap()
    .enabled(hold)
    .numberOfTaps(2)
    .onEnd((event) => {
      if (scale.value > REST) {
        rest();
        return;
      }
      begin(event.x, event.y);
      zoomAbout(TAP_SCALE, from.value.focalX, from.value.focalY);
      scheduleOnRN(setZoomed, true);
    });

  const style = useAnimatedStyle(() => ({
    // Translate before scale: the offsets are distances on the screen, not in
    // the photograph's own magnified space.
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  return {
    gesture: Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, drag)),
    style,
    zoomed,
  };
}
