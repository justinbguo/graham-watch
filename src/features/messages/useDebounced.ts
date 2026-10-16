import { useEffect, useState } from 'react';

/** Hold a value until changes pause. A search waits out a burst of keystrokes. */
export function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
