import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { askToSave } from '@/features/auth/guest';
import { judgeAction, type JudgeSurface } from '@/features/auth/guestLedger';
import { useGuest } from '@/features/auth/GuestProvider';
import { useFilters } from '@/features/filters/provider';
import { track } from '@/lib/analytics';
import type { DeckCard, SwipeDirection } from '@/lib/models';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { deckHasCard, dropJudgedCard, restorePassedCard, type DeckCache } from './deckPaging';
import { keys } from './keys';
import { logEvent, type ListingRef } from './listingEvents';
import type { ListingCounts } from './listings';

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
 * Only the passes. A right swipe is a decision the user can still see on the wishlist,
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

type Verdict = 'recorded' | 'asked';

type JudgeHooks = {
  /** The verdict stands. Runs before the write drops the card from every cached deck. */
  onAccept?: () => void;
  /** The write landed. */
  onRecorded?: () => void;
};

/**
 * The only way a gesture becomes a swipe and an event. A guest's save is held
 * and sent to sign-in. Every other verdict is logged and written.
 */
export function useJudge(surface: JudgeSurface) {
  const { isSignedIn, userId } = useSession();
  const write = useRecordSwipe(userId);
  const { mutate } = write;

  const judge = useCallback(
    (card: ListingRef, direction: SwipeDirection, hooks?: JudgeHooks): Verdict => {
      if (judgeAction(isSignedIn, direction) === 'ask') {
        void askToSave(card, surface);
        return 'asked';
      }
      // TanStack runs onMutate synchronously inside mutate, and it drops the
      // card from the deck. The deck has to hold the leaving slot first.
      hooks?.onAccept?.();
      logEvent({ kind: direction === 'right' ? 'save' : 'pass', surface, listing: card });
      mutate({ listingId: card.id, direction }, { onSuccess: hooks?.onRecorded });
      return 'recorded';
    },
    [isSignedIn, surface, mutate]
  );

  const writing: SwipeDirection | null = write.isPending ? (write.variables?.direction ?? null) : null;
  return { judge, writing };
}

/**
 * The card leaves the deck the instant the gesture ends, before the write is
 * acknowledged. A swipe that waits on the network feels broken.
 *
 * The removal has to be undone by hand when the write fails. `useDeck` sets
 * `staleTime: Infinity` and does not refetch on focus, so there is no later
 * fetch to fall back on: without the restore below, a save that failed took the
 * watch out of the pile for the rest of the session and saved nothing.
 *
 * A guest only reaches here with a pass. `useJudge` sends a guest's save to
 * sign-in first.
 */
function useRecordSwipe(actorId: string | null) {
  const queryClient = useQueryClient();
  const guest = useGuest();

  return useMutation({
    mutationFn: ({ listingId, direction }: { listingId: string; direction: SwipeDirection }) => {
      if (!actorId) {
        if (direction !== 'left') throw new Error('Guest saves use askToSave.');
        return guest.recordPass(listingId);
      }
      return recordSwipe(actorId, listingId, direction);
    },
    onMutate: ({ listingId }) => {
      // Every cached deck, not just the current filter's: the card is judged and
      // must not reappear by changing a filter and changing it back.
      const previous = queryClient.getQueriesData<DeckCache<DeckCard>>({ queryKey: ['deck'] });
      const previousCounts = queryClient.getQueriesData<ListingCounts>({
        queryKey: ['listing-counts'],
      });

      // The header reads `matched`, which is what is left to see. Drop it with
      // the card, and only for a pile that actually held the watch — a filter
      // it never matched keeps its number. Waiting for `listing_counts_v2`
      // would leave the line a swipe behind the card. The page's cursor stays:
      // the next page is the bookmark the database returned, not a count of
      // cards still in hand. Two sorts of one filter share that count, so a
      // watch sitting in both piles decrements it once.
      const counted = new Set<unknown>();
      for (const [key, deck] of previous) {
        if (!deckHasCard(deck, listingId)) continue;
        const token = key[1];
        if (counted.has(token)) continue;
        counted.add(token);
        queryClient.setQueryData<ListingCounts>(keys.counts(token), (counts) =>
          counts ? { ...counts, matched: Math.max(0, counts.matched - 1) } : counts
        );
      }

      queryClient.setQueriesData<DeckCache<DeckCard>>({ queryKey: ['deck'] }, (deck) =>
        deck ? dropJudgedCard(deck, listingId) : deck
      );

      return { previous, previousCounts };
    },
    onError: (_error, _variables, context) => {
      // Back in the order they were in, rather than on top like an undo: the
      // user did not ask for this card again, the write simply did not land.
      for (const [key, deck] of context?.previous ?? []) {
        queryClient.setQueryData(key, deck);
      }
      for (const [key, counts] of context?.previousCounts ?? []) {
        queryClient.setQueryData(key, counts);
      }
    },
    onSuccess: (_data, variables) => {
      track('swipe', { direction: variables.direction, listing_id: variables.listingId });
      if (variables.direction === 'right') {
        track('save', { listing_id: variables.listingId });
      }
      // The deck's facet list drops a judged watch. A brand's new total is a
      // question for `listing_facets_v2`, so the sheet asks again instead of
      // guessing which row changed.
      queryClient.invalidateQueries({ queryKey: keys.facets });
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
 * on the wishlist, waiting to be undone there. The row is deleted rather than flipped,
 * so the watch is genuinely unjudged and returns to any freshly fetched deck.
 */
export function useUndoPass(actorId: string | null) {
  const queryClient = useQueryClient();
  const guest = useGuest();
  const { filters } = useFilters('deck');
  const deckKey = keys.deck(filters);

  return useMutation({
    mutationFn: (card: DeckCard) => {
      if (!actorId) return guest.undoPass(card.id);
      return deleteSwipe(actorId, card.id);
    },
    onMutate: (card) => {
      const deck = queryClient.getQueryData<DeckCache<DeckCard>>(deckKey);
      const already = deckHasCard(deck, card.id);
      const previousCounts = queryClient.getQueryData<ListingCounts>(keys.counts(filters));

      // Onto the top of the pile, not wherever the server would rank it. The
      // user is correcting a thumb slip and expects that same watch back.
      if (!already) {
        queryClient.setQueryData<DeckCache<DeckCard>>(deckKey, (current) =>
          restorePassedCard(current, card)
        );
        queryClient.setQueryData<ListingCounts>(keys.counts(filters), (counts) =>
          counts ? { ...counts, matched: Math.min(counts.total, counts.matched + 1) } : counts
        );
      }

      return { already, previousCounts };
    },
    onError: (_error, card, context) => {
      if (context?.already) return;
      queryClient.setQueryData<DeckCache<DeckCard>>(deckKey, (deck) =>
        deck ? dropJudgedCard(deck, card.id) : deck
      );
      if (context?.previousCounts) {
        queryClient.setQueryData(keys.counts(filters), context.previousCounts);
      }
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
      // Other filters lost a count when the card left their pile. This one was
      // put back by hand above; the rest ask the server.
      queryClient.invalidateQueries({
        queryKey: ['listing-counts'],
        predicate: (query) => JSON.stringify(query.queryKey) !== JSON.stringify(keys.counts(filters)),
      });
      queryClient.invalidateQueries({ queryKey: keys.facets });
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
      queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
      queryClient.invalidateQueries({ queryKey: keys.facets });
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
      queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
      queryClient.invalidateQueries({ queryKey: keys.facets });
      if (actorId) queryClient.invalidateQueries({ queryKey: keys.passes(actorId) });
    },
  });
}
