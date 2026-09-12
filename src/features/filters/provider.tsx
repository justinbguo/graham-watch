import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { NO_FILTERS, type Filters } from './types';

/**
 * The deck and the search tab filter independently. They are different jobs:
 * the deck is a queue you are working through, search is a question you are
 * asking. Narrowing search to "chronographs under $15k" should not silently
 * throw away the pile you were halfway through swiping.
 */
export type Surface = 'deck' | 'search';

type ListKey = 'brands' | 'dealers' | 'styles' | 'materials' | 'windings' | 'complications';
type SingleKey = 'query' | 'size' | 'era';

export type FilterApi = {
  filters: Filters;
  toggle: <K extends ListKey>(key: K, value: Filters[K][number]) => void;
  setOne: <K extends SingleKey>(key: K, value: Filters[K]) => void;
  /** Both ends at once, so a preset chip does not land as two renders. */
  setPrice: (min: number | null, max: number | null) => void;
  clear: () => void;
};

type Store = {
  bySurface: Record<Surface, Filters>;
  update: (surface: Surface, next: (current: Filters) => Filters) => void;
};

const Context = createContext<Store | null>(null);

export function FilterProvider({ children }: PropsWithChildren) {
  const [bySurface, setBySurface] = useState<Record<Surface, Filters>>({
    deck: NO_FILTERS,
    search: NO_FILTERS,
  });

  const update = useCallback<Store['update']>((surface, next) => {
    setBySurface((current) => ({ ...current, [surface]: next(current[surface]) }));
  }, []);

  const value = useMemo<Store>(() => ({ bySurface, update }), [bySurface, update]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFilters(surface: Surface): FilterApi {
  const store = useContext(Context);
  if (!store) throw new Error('useFilters must be used inside FilterProvider.');

  const { bySurface, update } = store;

  return useMemo(
    () => ({
      filters: bySurface[surface],
      toggle: (key, item) =>
        update(surface, (current) => {
          const list = current[key] as (typeof item)[];
          return {
            ...current,
            [key]: list.includes(item) ? list.filter((v) => v !== item) : [...list, item],
          };
        }),
      // Ranges are single-choice: tapping the active one turns it off.
      setOne: (key, next) =>
        update(surface, (current) => ({
          ...current,
          [key]: current[key] === next && key !== 'query' ? null : next,
        })),
      setPrice: (min, max) =>
        update(surface, (current) => ({ ...current, priceMin: min, priceMax: max })),
      clear: () => update(surface, () => NO_FILTERS),
    }),
    [bySurface, surface, update]
  );
}
