import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

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

/** `none` means no refresh has sealed a batch on this database yet. */
export type NewListings =
  | { state: 'loading' }
  | { state: 'error'; refetch: () => void }
  | { state: 'none'; refetch: () => void }
  | {
      state: 'ready';
      sealedAt: string;
      /** Size of the batch, the same number as the badge. Not `cards.length`. */
      total: number;
      cards: DeckCard[];
      loadingMore: boolean;
      hasNextPage: boolean;
      isFetching: boolean;
      isFetchNextPageError: boolean;
      latestPageAdded: number | undefined;
      loadMore: () => void;
      refetch: () => void;
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

function useNewBatch(enabled = true) {
  return useQuery({
    queryKey: keys.newBatch,
    queryFn: fetchBatch,
    enabled,
    // A batch is sealed once a night.
    staleTime: 10 * 60_000,
  });
}

/** The red number on New. 0 while loading, on error, and before the first seal. */
export function useNewCount(): number {
  return useNewBatch().data?.listingIds.length ?? 0;
}

/**
 * The New screen. Reads the same cached batch as `useNewCount`.
 * `enabled` is false on Buy so that tab does not hydrate this batch.
 * `pageAll` keeps asking for the next page until the id list is in hand,
 * which a filter needs. The grid and the card pile page themselves.
 */
export function useNewListings(options?: { enabled?: boolean; pageAll?: boolean }): NewListings {
  const enabled = options?.enabled !== false;
  const pageAll = options?.pageAll === true && enabled;
  const batch = useNewBatch(enabled);
  const current = batch.data ?? null;
  const ids = current?.listingIds ?? [];

  const pages = useInfiniteQuery({
    queryKey: keys.newPage(current?.id ?? 'none', current?.listingIds ?? EMPTY_IDS),
    enabled: enabled && ids.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(ids.slice(pageParam, pageParam + PAGE_SIZE)),
    getNextPageParam: (_last, _all, offset) =>
      offset + PAGE_SIZE < ids.length ? offset + PAGE_SIZE : undefined,
    staleTime: Infinity,
  });

  const loadMore = useCallback(() => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  }, [pages.hasNextPage, pages.isFetchingNextPage, pages.fetchNextPage]);

  useEffect(() => {
    if (!pageAll || !pages.hasNextPage || pages.isFetchingNextPage || pages.isFetchNextPageError) return;
    loadMore();
  }, [pageAll, pages.hasNextPage, pages.isFetchingNextPage, pages.isFetchNextPageError, loadMore]);

  const refetch = useCallback(() => {
    void batch.refetch();
    void pages.refetch();
  }, [batch, pages]);

  const cards = useMemo(() => (pages.data?.pages ?? []).flat(), [pages.data]);

  if (!enabled || batch.isPending) return { state: 'loading' };
  if (batch.isError) return { state: 'error', refetch };
  if (!current) return { state: 'none', refetch };
  if (ids.length > 0 && pages.isPending) return { state: 'loading' };
  if (pages.isError) return { state: 'error', refetch };

  const loaded = pages.data?.pages ?? [];
  return {
    state: 'ready',
    sealedAt: current.sealedAt,
    total: ids.length,
    cards,
    loadingMore: pages.isFetchingNextPage,
    hasNextPage: pages.hasNextPage,
    isFetching: pages.isFetching,
    isFetchNextPageError: pages.isFetchNextPageError,
    latestPageAdded: loaded.length ? loaded[loaded.length - 1].length : undefined,
    loadMore,
    refetch,
  };
}
