import { useEffect, useRef } from 'react';
import type { TextInput } from 'react-native';

/**
 * iOS drops `autoFocus` when a slide has just mounted, and again when the
 * previous field's keyboard is still dismissing. Focusing once that settles
 * is what actually opens the keys.
 */
const FOCUS_DELAY_MS = 300;

export function useFocusOnShow() {
  const ref = useRef<TextInput>(null);

  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  return ref;
}
