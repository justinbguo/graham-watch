import { useQuery } from '@tanstack/react-query';

import { catalogueFacets } from '@/features/filters/facets';
import { toRpcArgs, type Filters } from '@/features/filters/types';
import { demo, isDemo } from '@/lib/demo';
import type { DeckCard } from '@/lib/models';
import { supabase } from '@/lib/supabase';

import { hydrate } from './listings';
import { keys } from './keys';

export type Facet = { kind: string; value: string; label: string; count: number };

async function fetchSearch(filters: Filters, limit: number): Promise<DeckCard[]> {
  if (isDemo) return demo.search(filters);

  const { data, error } = await supabase.rpc('search_listings', {
    p_limit: limit,
    // The deck hides watches this account imported. Search is where you check
    // a shop you just published is actually findable, so it keeps them.
    p_exclude_own: false,
    ...toRpcArgs(filters),
  });
  if (error) throw error;
  return hydrate(data ?? []);
}

async function fetchFacets(excludeOwn: boolean): Promise<Facet[]> {
  // Demo fixtures belong to a stand-in importer, not the demo account, so
  // exclude-own does not drop a shop here. The real call still passes the flag.
  if (isDemo) return catalogueFacets(demo.catalogue());

  const { data, error } = await supabase.rpc('listing_facets', {
    p_exclude_own: excludeOwn,
  });
  if (error) throw error;
  return (data ?? []) as Facet[];
}

export function useSearch(filters: Filters, limit = 50) {
  return useQuery({
    queryKey: keys.search(filters),
    queryFn: () => fetchSearch(filters, limit),
    // Unlike the deck, results are meant to change as you type.
    staleTime: 30_000,
  });
}

/**
 * How many watches match, not how many this page is showing. The list stops
 * at 50, so its length freezes there and a newly published watch never moves
 * the number.
 */
export function useSearchCount(filters: Filters) {
  return useQuery({
    queryKey: keys.searchCount(filters),
    placeholderData: (previous) => previous,
    queryFn: async () => {
      if (isDemo) return demo.search(filters).length;

      const { data, error } = await supabase.rpc('listing_counts', {
        p_exclude_swiped: false,
        p_exclude_own: false,
        ...toRpcArgs(filters),
      });
      if (error) throw error;
      return Number(data?.[0]?.matched ?? 0);
    },
  });
}

/**
 * The filter options worth showing: only what some visible listing actually is.
 *
 * The deck passes `excludeOwn`, because it will not show a watch this account
 * imported and a filter for one would be a dead end. Search does not.
 */
export function useFacets(excludeOwn = true, enabled = true) {
  return useQuery({
    queryKey: [...keys.facets, excludeOwn],
    queryFn: () => fetchFacets(excludeOwn),
    staleTime: 5 * 60_000,
    enabled,
  });
}
