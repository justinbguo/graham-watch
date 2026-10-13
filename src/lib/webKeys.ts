import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** True when the key would edit a field rather than steer the page. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

type ArrowHandlers = {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
};

/**
 * Desktop arrow keys for the deck. Left/right are the swipe; up/down page the
 * photograph roll. Skips when a field has focus, and only runs on web.
 */
export function useWebArrowKeys(handlers: ArrowHandlers, enabled = true) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const { onLeft, onRight, onUp, onDown } = latest.current;
      switch (event.key) {
        case 'ArrowLeft':
          if (!onLeft) return;
          event.preventDefault();
          onLeft();
          return;
        case 'ArrowRight':
          if (!onRight) return;
          event.preventDefault();
          onRight();
          return;
        case 'ArrowUp':
          if (!onUp) return;
          event.preventDefault();
          onUp();
          return;
        case 'ArrowDown':
          if (!onDown) return;
          event.preventDefault();
          onDown();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
