import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { demo, isDemo } from '@/lib/demo';
import type { DeckCard } from '@/lib/models';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';
import { hydrate } from './listings';

const PAGE_SIZE = 24;
const EMPTY_IDS: readonly string[] = [];

/** One sealed catalogue batch. `listingIds` is newest first and is the badge. */
type NewBatch = {
  id: string;
  sealedAt: string;
  listingIds: readonly string[];
};

export type NewListings =
  | { state: 'loading' }
  | { state: 'error' }
  /** No refresh has sealed a batch on this database yet. */
  | { state: 'none' }
  | {
      state: 'ready';
      sealedAt: string;
      /** Size of the batch, the same number as the badge. Not `cards.length`. */
      total: number;
      cards: DeckCard[];
      loadingMore: boolean;
      loadMore: () => void;
    };

async function fetchBatch(): Promise<NewBatch | null> {
  if (isDemo) return demo.newBatch();
  const { data, error } = await supabase.rpc('latest_catalogue_batch');
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { id: row.batch_id, sealedAt: row.sealed_at, listingIds: row.listing_ids };
}

async function fetchPage(ids: readonly string[]): Promise<DeckCard[]> {
  if (isDemo) return demo.listings(ids);
  const { data, error } = await supabase.from('listings').select('*').in('id', [...ids]);
  if (error) throw error;
  const cards = await hydrate(data ?? []);
  const order = new Map(ids.map((id, index) => [id, index]));
  return cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function useNewBatch() {
  return useQuery({
    queryKey: keys.newBatch,
    queryFn: fetchBatch,
    // A batch is sealed once a night.
    staleTime: 10 * 60_000,
  });
}

/** The red number on New. 0 while loading, on error, and before the first seal. */
export function useNewCount(): number {
  return useNewBatch().data?.listingIds.length ?? 0;
}

/** The New screen. Reads the same cached batch as `useNewCount`. */
export function useNewListings(): NewListings {
  const batch = useNewBatch();
  const current = batch.data ?? null;
  const ids = current?.listingIds ?? [];

  const pages = useInfiniteQuery({
    queryKey: keys.newPage(current?.id ?? 'none', current?.listingIds ?? EMPTY_IDS),
    enabled: ids.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(ids.slice(pageParam, pageParam + PAGE_SIZE)),
    getNextPageParam: (_last, _all, offset) =>
      offset + PAGE_SIZE < ids.length ? offset + PAGE_SIZE : undefined,
    staleTime: Infinity,
  });

  if (batch.isPending) return { state: 'loading' };
  if (batch.isError) return { state: 'error' };
  if (!current) return { state: 'none' };
  if (ids.length > 0 && pages.isPending) return { state: 'loading' };
  if (pages.isError) return { state: 'error' };

  return {
    state: 'ready',
    sealedAt: current.sealedAt,
    total: ids.length,
    cards: pages.data?.pages.flat() ?? [],
    loadingMore: pages.isFetchingNextPage,
    loadMore: () => {
      if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
    },
  };
}
