import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { NO_FILTERS, toggleRange, type Filters, type Preset } from './types';

/**
 * The deck and the search tab filter independently. They are different jobs:
 * the deck is a queue you are working through, search is a question you are
 * asking. Narrowing search to "chronographs under $15k" should not silently
 * throw away the pile you were halfway through swiping.
 */
export type Surface = 'deck' | 'search';

type ListKey = 'brands' | 'dealers' | 'styles' | 'materials' | 'windings' | 'complications' | 'sizes' | 'eras';

export type FilterApi = {
  filters: Filters;
  toggle: <K extends ListKey>(key: K, value: Filters[K][number]) => void;
  setOne: (key: 'query', value: string) => void;
  /** Both ends at once, so a typed range does not land as two renders. */
  setPrice: (min: number | null, max: number | null) => void;
  togglePrice: (preset: Preset) => void;
  replace: (next: Filters) => void;
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
      setOne: (key, next) => update(surface, (current) => ({ ...current, [key]: next })),
      // The boxes are one range. Typing replaces every selected price band
      // with that range; clearing both ends clears price.
      setPrice: (min, max) =>
        update(surface, (current) => ({
          ...current,
          prices: min == null && max == null ? [] : [{ min, max }],
        })),
      togglePrice: (preset) =>
        update(surface, (current) => ({
          ...current,
          prices: toggleRange(current.prices, { min: preset.min, max: preset.max }),
        })),
      replace: (next) => update(surface, () => next),
      clear: () => update(surface, () => NO_FILTERS),
    }),
    [bySurface, surface, update]
  );
}
