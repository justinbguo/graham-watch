import { useQuery } from '@tanstack/react-query';

import { canonicalize } from '@/features/filters/spec';
import type { Filters } from '@/features/filters/types';
import type { Json } from '@/lib/database';
import { supabase } from '@/lib/supabase';

export async function matchingListingIds(ids: readonly string[], spec: Json): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('filter_listing_ids', {
    p_ids: [...ids],
    p_spec: spec,
  });
  if (error) throw error;
  const keep = new Set((data ?? []).map((row) => row.id));
  return ids.filter((id) => keep.has(id));
}

export function useListingMatch(ids: readonly string[], filters: Filters, enabled: boolean) {
  const token = canonicalize(filters).key;
  return useQuery({
    queryKey: ['listing-match', token, ids] as const,
    enabled: enabled && ids.length > 0,
    placeholderData: (previous) => previous,
    queryFn: () => matchingListingIds(ids, canonicalize(filters).spec as Json),
  });
}
