import { useQuery } from '@tanstack/react-query';

import { catalogueFacets, UNKNOWN_FACET_VALUE } from '@/features/filters/facets';
import { canonicalize } from '@/features/filters/spec';
import { toRpcArgs, type Filters } from '@/features/filters/types';
import type { Json } from '@/lib/database';
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
    // The deck hides watches from a shop this account has claimed. Search is
    // where you check a shop you just published is actually findable, so it
    // keeps them. Importing a listing does not hide it from the deck.
    p_exclude_own: false,
    ...toRpcArgs(filters),
  });
  if (error) throw error;
  return hydrate(data ?? []);
}

async function fetchFacets(excludeOwn: boolean): Promise<Facet[]> {
  // Demo fixtures belong to a stand-in importer, not the demo account, so
  // exclude-own does not drop a shop here. The real call still passes the flag.
  // Onboarding picks brands to follow. Unknown is not a brand, so it stays out
  // of this list. The filter sheet uses `listing_facets_v2`, which does return it.
  if (isDemo) {
    return catalogueFacets(demo.catalogue()).filter((facet) => facet.value !== UNKNOWN_FACET_VALUE);
  }

  const { data, error } = await supabase.rpc('listing_facets', {
    p_exclude_own: excludeOwn,
  });
  if (error) throw error;
  return (data ?? []) as Facet[];
}

/**
 * Facet rows for the filter sheet.
 *
 * `p_spec` is the canonical filter, the same object the deck sends to
 * `listing_counts_v2`. The database drops this dimension's own selection
 * when it counts that dimension, and puts watches with no value in Unknown.
 * Demo mode has no database. It counts the fixture cards the same way, and
 * a deck request skips watches already swiped so the rows match the pile.
 */
async function fetchFilterFacets(
  filters: Filters,
  excludeOwn: boolean,
  excludeSwiped: boolean,
): Promise<Facet[]> {
  if (isDemo) {
    // The deck skips watches already judged. Search counts the whole catalogue.
    // `demo.deck()` with no filter is every unswiped fixture; the facet count
    // below applies `filters`, dropping each dimension's own selection.
    const population = excludeSwiped ? demo.deck() : demo.catalogue();
    return catalogueFacets(population, filters);
  }

  const { data, error } = await supabase.rpc('listing_facets_v2', {
    p_spec: canonicalize(filters).spec as Json,
    p_exclude_swiped: excludeSwiped,
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
 * Brands worth offering before a filter is chosen.
 *
 * Onboarding and settings ask for the whole catalogue, with no spec.
 * `listing_facets` is that list. A claimed shop is left out, which is the
 * function's default, so a brand that exists only there is not offered as
 * a favorite. The filter sheet does not use this. It calls `listing_facets_v2`.
 */
export function useFacets(excludeOwn = true, enabled = true) {
  return useQuery({
    queryKey: keys.facetsQuery(excludeOwn),
    queryFn: () => fetchFacets(excludeOwn),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/**
 * The filter sheet's options, for the filter that is on right now.
 *
 * The cache key is the canonical spec, plus whether judged watches and a
 * claimed shop are in the list. The deck passes both flags, because that is
 * how the pile is drawn. Search passes neither. A shop does not call this:
 * its watches are already on the page, including a shop the caller claimed,
 * which this function would hide.
 */
export function useFilterFacets(
  filters: Filters,
  {
    excludeOwn,
    excludeSwiped,
    enabled = true,
  }: { excludeOwn: boolean; excludeSwiped: boolean; enabled?: boolean },
) {
  return useQuery({
    queryKey: keys.facetsQuery(excludeOwn, filters, excludeSwiped),
    queryFn: () => fetchFilterFacets(filters, excludeOwn, excludeSwiped),
    placeholderData: (previous) => previous,
    staleTime: 5 * 60_000,
    enabled,
  });
}
