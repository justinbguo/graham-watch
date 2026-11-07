import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isDemo } from '@/lib/demo';
import type { DeckCard } from '@/lib/models';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { hydrate } from './listings';
import { keys } from './keys';

export type DropCount = {
  dealerId: string;
  unseen: number;
};

/** Unseen watches listed after the buyer followed, one number per shop. */
export function useDropCounts(userId: string | null) {
  return useQuery({
    queryKey: keys.dropCounts(userId ?? 'none'),
    enabled: Boolean(userId) && !isDemo,
    queryFn: async (): Promise<DropCount[]> => {
      const { data, error } = await supabase.rpc('unseen_drops_by_dealer');
      if (error) throw error;
      return (data ?? []).map((row) => ({ dealerId: row.dealer_id, unseen: row.unseen }));
    },
  });
}

export function useUnseenDropCount(): number {
  const { userId } = useSession();
  const { data } = useDropCounts(userId);
  if (!data) return 0;
  return data.reduce((sum, row) => sum + row.unseen, 0);
}

/**
 * Newest watches listed after the follow, including ones the badge has already
 * cleared. Opening the screen marks them seen; the list is not "unseen only",
 * or it would empty on the frame the count goes to zero.
 */
export function useDropFeed(userId: string | null) {
  return useQuery({
    queryKey: keys.dropFeed(userId ?? 'none'),
    enabled: Boolean(userId) || isDemo,
    queryFn: async (): Promise<DeckCard[]> => {
      if (isDemo || !userId) return [];

      const { data, error } = await supabase.rpc('followed_new_listing_ids');
      if (error) throw error;
      const ids = (data ?? []).map((row) => row.id);
      if (ids.length === 0) return [];

      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .in('id', ids);
      if (listingsError) throw listingsError;

      const cards = await hydrate(listings ?? []);
      const order = new Map(ids.map((id, index) => [id, index]));
      cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return cards;
    },
  });
}

/** Opening a shop clears that shop. Opening the feed clears every shop, or one shop when a dealer is named. */
export function useMarkDropsSeen() {
  const { userId } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealerId: string | null) => {
      if (!userId || isDemo) return;
      const { error } = await supabase.rpc(
        'mark_drops_seen',
        dealerId ? { p_dealer_id: dealerId } : {},
      );
      if (error) throw error;
    },
    onSuccess: () => {
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: keys.dropCounts(userId) });
    },
  });
}
