import { useQuery } from '@tanstack/react-query';

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
    ...toRpcArgs(filters),
  });
  if (error) throw error;
  return hydrate(data ?? []);
}

async function fetchFacets(): Promise<Facet[]> {
  if (isDemo) return demo.facets();

  const { data, error } = await supabase.rpc('listing_facets');
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

/** The filter options worth showing: only what some visible listing actually is. */
export function useFacets() {
  return useQuery({
    queryKey: keys.facets,
    queryFn: fetchFacets,
    staleTime: 5 * 60_000,
  });
}
