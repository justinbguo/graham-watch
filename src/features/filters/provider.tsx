import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { NO_FILTERS, type Filters } from './types';

type FilterContext = {
  filters: Filters;
  setFilters: (next: Filters) => void;
  toggle: <K extends 'brands' | 'styles' | 'materials' | 'windings' | 'complications'>(
    key: K,
    value: Filters[K][number]
  ) => void;
  setOne: <K extends 'query' | 'price' | 'size' | 'era'>(key: K, value: Filters[K]) => void;
  clear: () => void;
};

const Context = createContext<FilterContext | null>(null);

/**
 * One set of filters for the whole app. The deck and the search tab read the
 * same state on purpose: narrowing to "chronographs under $15k" in search and
 * then finding the deck still showing everything would make the filter feel
 * like it had not been applied.
 */
export function FilterProvider({ children }: PropsWithChildren) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const value = useMemo<FilterContext>(
    () => ({
      filters,
      setFilters,
      toggle: (key, item) =>
        setFilters((current) => {
          const list = current[key] as typeof item[];
          return {
            ...current,
            [key]: list.includes(item) ? list.filter((v) => v !== item) : [...list, item],
          };
        }),
      // Ranges are single-choice: tapping the active one turns it off.
      setOne: (key, next) =>
        setFilters((current) => ({
          ...current,
          [key]: current[key] === next && key !== 'query' ? null : next,
        })),
      clear: () => setFilters(NO_FILTERS),
    }),
    [filters]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFilters(): FilterContext {
  const context = useContext(Context);
  if (!context) throw new Error('useFilters must be used inside FilterProvider.');
  return context;
}
