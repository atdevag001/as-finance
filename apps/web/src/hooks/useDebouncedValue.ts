'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a value that only updates after `delayMs` of no change.
 * Used by filter inputs so we don't fire a backend request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
