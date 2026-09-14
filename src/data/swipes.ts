import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useFilters } from '@/features/filters/provider';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

async function recordSwipe(actorId: string, listingId: string, direction: SwipeDirection) {
  if (isDemo) return demo.recordSwipe(listingId, direction);

  const { error } = await supabase
    .from('swipes')
    .upsert(
      { actor_id: actorId, listing_id: listingId, direction },
      { onConflict: 'actor_id,listing_id' }
    );
  if (error) throw error;
}

async function deleteSwipe(actorId: string, listingId: string) {
  if (isDemo) return demo.unsave(listingId);

  const { error } = await supabase
    .from('swipes')
    .delete()
    .eq('actor_id', actorId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

async function countPasses(actorId: string): Promise<number> {
  if (isDemo) return demo.passCount();

  const { count, error } = await supabase
    .from('swipes')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', actorId)
    .eq('direction', 'left');

  if (error) throw error;
  return count ?? 0;
}

/**
 * Only the passes. A right swipe is a decision the user can still see in Saved,
 * and deleting those rows would empty that list without saying so.
 */
async function deletePasses(actorId: string) {
  if (isDemo) return demo.startOver();

  const { error } = await supabase
    .from('swipes')
    .delete()
    .eq('actor_id', actorId)
    .eq('direction', 'left');
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
      // Every cached deck, not just the current filter's: the card is judged and
      // must not reappear by changing a filter and changing it back.
      queryClient.setQueriesData<DeckCard[]>({ queryKey: ['deck'] }, (deck) =>
        (deck ?? []).filter((card) => card.id !== listingId)
      );
    },
    onSuccess: () => {
      if (!actorId) return;
      // Both lists, whichever way the thumb went. The write is an upsert, so
      // saving a watch from the listing screen after passing on it in the deck
      // moves the row rather than adding one, and the count it left behind is
      // wrong until something refetches it.
      queryClient.invalidateQueries({ queryKey: keys.saved(actorId) });
      queryClient.invalidateQueries({ queryKey: keys.passes(actorId) });
    },
  });
}

/**
 * A pass is the only swipe with nothing to show for it — a save is still sitting
 * in Saved, waiting to be undone there. The row is deleted rather than flipped,
 * so the watch is genuinely unjudged and returns to any freshly fetched deck.
 */
export function useUndoPass(actorId: string | null) {
  const queryClient = useQueryClient();
  const { filters } = useFilters('deck');
  const deckKey = keys.deck(filters);

  return useMutation({
    mutationFn: (card: DeckCard) => {
      if (!actorId) throw new Error('Not signed in.');
      return deleteSwipe(actorId, card.id);
    },
    onMutate: (card) => {
      // Onto the top of the pile, not wherever the server would rank it. The
      // user is correcting a thumb slip and expects that same watch back.
      queryClient.setQueryData<DeckCard[]>(deckKey, (deck) =>
        !deck || deck.some((entry) => entry.id === card.id) ? deck : [card, ...deck]
      );
    },
    onError: (_error, card) => {
      queryClient.setQueryData<DeckCard[]>(deckKey, (deck) =>
        (deck ?? []).filter((entry) => entry.id !== card.id)
      );
    },
    onSuccess: () => {
      if (actorId) queryClient.invalidateQueries({ queryKey: keys.passes(actorId) });
      // Every deck but this one. Whether the watch belongs in another filter's
      // deck is a question only the server can answer, so those are marked
      // stale. This deck is left alone: it was patched by hand above to put the
      // card back on top, and a refetch would re-rank it somewhere the user is
      // not looking.
      queryClient.invalidateQueries({
        queryKey: ['deck'],
        predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(deckKey),
      });
    },
  });
}

/** How many watches are waiting to come back, which is what makes the offer honest. */
export function usePassCount(actorId: string | null) {
  return useQuery({
    queryKey: keys.passes(actorId ?? 'anonymous'),
    queryFn: () => countPasses(actorId!),
    enabled: Boolean(actorId),
  });
}

export function useStartOver(actorId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!actorId) throw new Error('Not signed in.');
      return deletePasses(actorId);
    },
    onSuccess: () => {
      // Every cached deck: the passes are gone for every filter, not just this one.
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      if (actorId) queryClient.invalidateQueries({ queryKey: keys.passes(actorId) });
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
      // Unsaving deletes the swipe, so the watch is unjudged again and belongs
      // back in the deck. Without this it stays missing from every cached deck
      // until something else forces a refetch.
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      if (actorId) queryClient.invalidateQueries({ queryKey: keys.passes(actorId) });
    },
  });
}
