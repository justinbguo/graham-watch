/** Horizontal trackpad distance that turns one grid photo. */
export const PHOTO_WHEEL_STEP = 48;

export type PhotoWheel = {
  /** True when this event is a horizontal swipe, so the page must not scroll sideways. */
  horizontal: boolean;
  nextAccumulated: number;
  direction: -1 | 0 | 1;
};

/**
 * A two-finger trackpad swipe arrives as many wheel events. Vertical motion
 * stays with the page. Horizontal motion accumulates until one photo step.
 */
export function photoWheelStep(deltaX: number, deltaY: number, accumulated: number): PhotoWheel {
  const horizontal = deltaX !== 0 && Math.abs(deltaX) > Math.abs(deltaY);
  if (!horizontal) {
    return { horizontal: false, nextAccumulated: accumulated, direction: 0 };
  }
  const sum = accumulated + deltaX;
  if (Math.abs(sum) < PHOTO_WHEEL_STEP) {
    return { horizontal: true, nextAccumulated: sum, direction: 0 };
  }
  return { horizontal: true, nextAccumulated: 0, direction: sum > 0 ? 1 : -1 };
}
