import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** True when the key would edit a field rather than steer the page. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Desktop arrow keys for a swipe-shaped action. Left and right only — up and
 * down stay free for lists. Skips when a field has focus, and only runs on web,
 * where a keyboard is a real pointer.
 */
export function useWebArrowSwipe(
  onLeft: (() => void) | undefined,
  onRight: (() => void) | undefined,
  enabled = true
) {
  const left = useRef(onLeft);
  const right = useRef(onRight);
  left.current = onLeft;
  right.current = onRight;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === 'ArrowLeft' && left.current) {
        event.preventDefault();
        left.current();
        return;
      }
      if (event.key === 'ArrowRight' && right.current) {
        event.preventDefault();
        right.current();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
