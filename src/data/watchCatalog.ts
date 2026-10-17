import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { keys } from './keys';

export type WatchCatalogHit = {
  id: string;
  brand_name: string;
  brand_slug: string;
  series_name: string;
  name: string;
  reference_number: string | null;
  thumbnail_url: string | null;
};

/** dials.co-backed reference rows for listing typeahead. */
export function useSuggestWatches(query: string, brand?: string) {
  const term = query.trim();
  const brandHint = brand?.trim() ?? '';

  return useQuery({
    queryKey: keys.watchCatalog(term, brandHint),
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('suggest_watches', {
        p_query: term,
        ...(brandHint ? { p_brand: brandHint } : {}),
        p_limit: 12,
      });
      if (error) throw error;
      return (data ?? []) as WatchCatalogHit[];
    },
  });
}
