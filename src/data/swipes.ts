import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { DeckCard, SwipeDirection } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

async function recordSwipe(actorId: string, listingId: string, direction: SwipeDirection) {
  const { error } = await supabase
    .from('swipes')
    .upsert(
      { actor_id: actorId, listing_id: listingId, direction },
      { onConflict: 'actor_id,listing_id' }
    );
  if (error) throw error;
}

async function deleteSwipe(actorId: string, listingId: string) {
  const { error } = await supabase
    .from('swipes')
    .delete()
    .eq('actor_id', actorId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

/**
 * The card leaves the deck the instant the gesture ends, before the write is
 * acknowledged. A swipe that waits on the network feels broken, and the worst
 * case for a failed write is the card reappearing on the next fetch.
 */
export function useRecordSwipe(actorId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, direction }: { listingId: string; direction: SwipeDirection }) => {
      if (!actorId) throw new Error('Not signed in.');
      return recordSwipe(actorId, listingId, direction);
    },
    onMutate: ({ listingId }) => {
      queryClient.setQueryData<DeckCard[]>(keys.deck, (deck) =>
        (deck ?? []).filter((card) => card.id !== listingId)
      );
    },
    onSuccess: (_result, { direction }) => {
      if (direction === 'right' && actorId) {
        queryClient.invalidateQueries({ queryKey: keys.saved(actorId) });
      }
    },
  });
}

export function useUnsave(actorId: string | null) {
  const queryClient = useQueryClient();
  const savedKey = keys.saved(actorId ?? 'anonymous');

  return useMutation({
    mutationFn: (listingId: string) => {
      if (!actorId) throw new Error('Not signed in.');
      return deleteSwipe(actorId, listingId);
    },
    onMutate: async (listingId) => {
      // Cancel in-flight fetches, or one could land and overwrite this removal.
      await queryClient.cancelQueries({ queryKey: savedKey });
      const previous = queryClient.getQueryData<DeckCard[]>(savedKey);

      queryClient.setQueryData<DeckCard[]>(savedKey, (saved) =>
        (saved ?? []).filter((card) => card.id !== listingId)
      );

      return { previous };
    },
    onError: (_error, _listingId, context) => {
      if (context?.previous) queryClient.setQueryData(savedKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: savedKey });
    },
  });
}
