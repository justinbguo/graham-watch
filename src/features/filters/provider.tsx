import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { logEvent, type EventInput } from '@/data/listingEvents';

import { canonicalize, type FilterSpec } from './spec';
import { NO_FILTERS, scopeDealer, toggleRange, type Filters, type Preset } from './types';

/**
 * The deck, search, and each shop filter independently. They are different
 * jobs: the deck is a queue you are working through, search is a question you
 * are asking, and a shop is one inventory. Narrowing search to "chronographs
 * under $15k" should not throw away the pile you were halfway through, and
 * narrowing one shop should not follow you into the next.
 */
export type Surface = 'deck' | 'search' | 'shop';

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
  /** Deck only. Other surfaces share the type and do not call these. */
  showOnlyDealer: (dealerId: string) => void;
  showAllDealers: () => void;
};

type CatalogSurface = 'deck' | 'search';

type Store = {
  deck: Filters;
  search: Filters;
  /** One set per shop, so Goldfinger's choices do not empty the next shop. */
  shops: Record<string, Filters>;
  update: (surface: CatalogSurface, next: (current: Filters) => Filters) => void;
  updateShop: (dealerId: string, next: (current: Filters) => Filters) => void;
};

const Context = createContext<Store | null>(null);

const UNFILTERED = canonicalize(NO_FILTERS).key;

export function FilterProvider({ children }: PropsWithChildren) {
  const [deck, setDeck] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState<Filters>(NO_FILTERS);
  const [shops, setShops] = useState<Record<string, Filters>>({});
  useFilterEvents(deck, search, shops);

  const update = useCallback<Store['update']>((surface, next) => {
    const set = surface === 'deck' ? setDeck : setSearch;
    set((current) => next(current));
  }, []);

  const updateShop = useCallback<Store['updateShop']>((dealerId, next) => {
    setShops((current) => ({
      ...current,
      [dealerId]: next(current[dealerId] ?? NO_FILTERS),
    }));
  }, []);

  const value = useMemo<Store>(
    () => ({ deck, search, shops, update, updateShop }),
    [deck, search, shops, update, updateShop],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * A `filter` event whenever a scope's canonical filter changes. Every scope
 * starts empty, which is not a choice, so mounting logs nothing. A change
 * that canonicalizes to the same spec, like a stray space in the search box,
 * logs nothing either.
 */
function useFilterEvents(deck: Filters, search: Filters, shops: Record<string, Filters>) {
  const logged = useRef(new Map<string, string>());
  useEffect(() => {
    const report = (scope: string, filters: Filters, event: (filter: FilterSpec) => EventInput) => {
      const { spec, key } = canonicalize(filters);
      if ((logged.current.get(scope) ?? UNFILTERED) === key) return;
      logged.current.set(scope, key);
      logEvent(event(spec));
    };
    report('deck', deck, (filter) => ({ kind: 'filter', surface: 'buy', filter }));
    report('search', search, (filter) => ({ kind: 'filter', surface: 'search', filter }));
    for (const [dealerId, filters] of Object.entries(shops)) {
      report(`shop:${dealerId}`, filters, (filter) => ({
        kind: 'filter',
        surface: 'shop',
        dealer: { id: dealerId },
        filter,
      }));
    }
  }, [deck, search, shops]);
}

export function useFilters(surface: Surface, dealerId?: string): FilterApi {
  const store = useContext(Context);
  if (!store) throw new Error('useFilters must be used inside FilterProvider.');

  const { update, updateShop } = store;
  const filters =
    surface === 'shop' ? (store.shops[dealerId ?? ''] ?? NO_FILTERS) : store[surface];

  return useMemo(() => {
    const apply = (next: (current: Filters) => Filters) => {
      if (surface === 'shop') {
        if (dealerId) updateShop(dealerId, next);
        return;
      }
      update(surface, next);
    };

    return {
      filters,
      toggle: (key, item) =>
        apply((current) => {
          const list = current[key] as (typeof item)[];
          return {
            ...current,
            [key]: list.includes(item) ? list.filter((v) => v !== item) : [...list, item],
          };
        }),
      setOne: (key, next) => apply((current) => ({ ...current, [key]: next })),
      // The boxes are one range. Typing replaces every selected price band
      // with that range; clearing both ends clears price.
      setPrice: (min, max) =>
        apply((current) => ({
          ...current,
          prices: min == null && max == null ? [] : [{ min, max }],
        })),
      togglePrice: (preset) =>
        apply((current) => ({
          ...current,
          prices: toggleRange(current.prices, { min: preset.min, max: preset.max }),
        })),
      replace: (next) => apply(() => next),
      clear: () => apply(() => NO_FILTERS),
      showOnlyDealer: (dealerId) => apply((current) => scopeDealer(current, dealerId)),
      showAllDealers: () => apply((current) => scopeDealer(current, null)),
    };
  }, [dealerId, filters, surface, update, updateShop]);
}
