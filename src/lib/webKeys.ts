import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** True when the key would edit a field rather than steer the page. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Desktop arrow keys on the buy deck. Left and right pass or save; optional up
 * and down step the photograph roll. S toggles card/grid when `onToggleView` is
 * set. Skips when a field has focus; web only.
 */
export function useWebArrowSwipe(
  onLeft: (() => void) | undefined,
  onRight: (() => void) | undefined,
  enabled = true,
  onUp?: () => void,
  onDown?: () => void,
  onToggleView?: () => void,
) {
  const left = useRef(onLeft);
  const right = useRef(onRight);
  const up = useRef(onUp);
  const down = useRef(onDown);
  const toggleView = useRef(onToggleView);
  left.current = onLeft;
  right.current = onRight;
  up.current = onUp;
  down.current = onDown;
  toggleView.current = onToggleView;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if ((event.key === 's' || event.key === 'S') && toggleView.current) {
        event.preventDefault();
        toggleView.current();
        return;
      }
      if (event.key === 'ArrowLeft' && left.current) {
        event.preventDefault();
        left.current();
        return;
      }
      if (event.key === 'ArrowRight' && right.current) {
        event.preventDefault();
        right.current();
        return;
      }
      if (event.key === 'ArrowUp' && up.current) {
        event.preventDefault();
        up.current();
        return;
      }
      if (event.key === 'ArrowDown' && down.current) {
        event.preventDefault();
        down.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
