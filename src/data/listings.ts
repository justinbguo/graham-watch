import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGuest } from '@/features/auth/GuestProvider';
import { useFilters } from '@/features/filters/provider';
import { toRpcArgs, type Filters } from '@/features/filters/types';
import type { DeckCard, DeckPhoto, Listing, ListingPhoto } from '@/lib/models';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import {
  appendDeckPage,
  deckPileFromPage,
  DECK_LIMIT,
  nextDeckOffset,
  shouldRefillDeck,
  showDeckEmpty,
  type DeckPile,
} from './deckPaging';
import { keys } from './keys';

export { DECK_LIMIT, showDeckEmpty };

const PHOTO_BUCKET = 'listing-photos';

/** Our copy when we have one, the dealer's own file when a copy failed. */
export function listingPhotoUrl(photo: Pick<ListingPhoto, 'storage_path' | 'source_url'>): string {
  return photo.storage_path
    ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photo.storage_path).data.publicUrl
    : photo.source_url;
}

function display(photo: ListingPhoto): DeckPhoto {
  return { ...photo, url: listingPhotoUrl(photo) };
}

/** Listings carry only a dealer_id; cards need the dealer's name and link too. */
export async function hydrate(listings: Listing[]): Promise<DeckCard[]> {
  if (listings.length === 0) return [];

  const [photos, dealers] = await Promise.all([
    supabase
      .from('listing_photos')
      .select('*')
      .in(
        'listing_id',
        listings.map((l) => l.id)
      )
      .order('position'),
    supabase
      .from('dealers')
      .select('id, name, website, description, instagram, logo_url')
      .in('id', [...new Set(listings.map((l) => l.dealer_id))]),
  ]);

  if (photos.error) throw photos.error;
  if (dealers.error) throw dealers.error;

  const photosByListing = new Map<string, DeckPhoto[]>();
  for (const photo of photos.data ?? []) {
    const bucket = photosByListing.get(photo.listing_id) ?? [];
    bucket.push(display(photo));
    photosByListing.set(photo.listing_id, bucket);
  }

  const dealerById = new Map((dealers.data ?? []).map((d) => [d.id, d]));

  return listings.map((listing) => ({
    ...listing,
    photos: photosByListing.get(listing.id) ?? [],
    dealer: dealerById.get(listing.dealer_id) ?? null,
  }));
}

async function fetchDeck(limit: number, filters: Filters, offset: number): Promise<DeckCard[]> {
  if (isDemo) return demo.deck(filters).slice(offset, offset + limit);

  // The deck is search with the cards you have already judged removed, and with
  // the brands you chose at sign-up dealt first. `p_exclude_own` hides a shop
  // this account has claimed. Importing a listing does not hide it, and a guest
  // has no account, so nothing is theirs to hide.
  const { data, error } = await supabase.rpc('search_listings', {
    p_limit: limit,
    p_offset: offset,
    p_exclude_swiped: true,
    p_favorites_first: true,
    p_exclude_own: true,
    ...toRpcArgs(filters),
  });
  if (error) throw error;
  return hydrate(data ?? []);
}

async function fetchSaved(actorId: string): Promise<DeckCard[]> {
  if (isDemo) return demo.saved();

  const { data: saved, error: savedError } = await supabase
    .from('swipes')
    .select('listing_id')
    .eq('actor_id', actorId)
    .eq('direction', 'right')
    .order('created_at', { ascending: false });
  if (savedError) throw savedError;

  const ids = (saved ?? []).map((row) => row.listing_id);
  if (ids.length === 0) return [];

  const { data: listings, error } = await supabase.from('listings').select('*').in('id', ids);
  if (error) throw error;

  // Keep the swipe order rather than whatever the listings query returns.
  const byId = new Map((listings ?? []).map((listing) => [listing.id, listing]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((listing): listing is Listing => listing !== undefined);

  return hydrate(ordered);
}

async function fetchListing(listingId: string): Promise<DeckCard | null> {
  if (isDemo) return demo.listing(listingId);

  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [card] = await hydrate([data]);
  return card ?? null;
}

/**
 * The deck already holds the whole card. Handing it to the listing cache before
 * navigating means the detail screen and the photo viewer open with their data
 * already there, instead of flashing a spinner over something you were looking at.
 */
export function usePrimeListing() {
  const queryClient = useQueryClient();

  return useCallback(
    (card: DeckCard) => queryClient.setQueryData(keys.listing(card.id), card),
    [queryClient]
  );
}

/**
 * One page at a time. The next page is fetched when five or fewer cards are
 * left and `matched` still exceeds what this screen has loaded.
 * The header does not count the pile: `listing_counts` is the number of
 * watches, and the pile is only the ones in hand.
 */
export function useDeck(limit = DECK_LIMIT) {
  const { filters } = useFilters('deck');
  const guest = useGuest();
  const { userId } = useSession();
  const counts = useListingCounts();
  const queryClient = useQueryClient();
  const [refillError, setRefillError] = useState<Error | null>(null);
  const generation = useRef(0);

  const query = useQuery({
    queryKey: keys.deck(filters),
    queryFn: async () => deckPileFromPage(await fetchDeck(limit, filters, 0), limit),
    // The deck is consumed by swiping, not by refetching. Re-running the first
    // page mid-pile would shuffle cards out from under the user's thumb. The
    // next page is appended below, on purpose.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Guest judgments never reach `swipes`, so the RPC cannot exclude them. Drop
  // them here so a refill does not put a pass back on top of the pile.
  const visible = useMemo(() => {
    const cards = query.data?.cards ?? [];
    if (guest.swipedIds.size === 0) return cards;
    return cards.filter((card) => !guest.swipedIds.has(card.id));
  }, [query.data, guest.swipedIds]);

  const seen = query.data?.seen ?? 0;
  const exhausted = query.data?.exhausted ?? false;
  const wantMore =
    query.data != null &&
    shouldRefillDeck({
      remaining: visible.length,
      matched: counts.data?.matched,
      seen,
      exhausted,
    });
  const filterKey = JSON.stringify(keys.deck(filters));
  const [attempt, setAttempt] = useState(0);
  const attempts = useRef(0);
  // Read when a refill starts. Listing the pile size as an effect dependency
  // would cancel the request on every swipe, and a signed-in offset moves as
  // cards leave.
  const remainingRef = useRef(visible.length);
  remainingRef.current = visible.length;

  useEffect(() => {
    if (!wantMore) return;
    const pageOffset = nextDeckOffset({
      guest: userId == null,
      seen,
      remaining: remainingRef.current,
    });
    const generationId = ++generation.current;
    let cancelled = false;
    void fetchDeck(limit, filters, pageOffset)
      .then((page) => {
        if (cancelled || generation.current !== generationId) return;
        attempts.current = 0;
        setRefillError(null);
        queryClient.setQueryData<DeckPile<DeckCard>>(keys.deck(filters), (current) =>
          current ? appendDeckPage(current, page, limit) : current,
        );
      })
      .catch((err: unknown) => {
        if (cancelled || generation.current !== generationId) return;
        attempts.current += 1;
        if (attempts.current <= 2) {
          setAttempt((current) => current + 1);
          return;
        }
        // Remember the failure even while cards remain. The screen only shows
        // it once the pile is empty — a failed refill must not throw away the
        // watch under the thumb — and Try again is that screen's existing button.
        setRefillError(err instanceof Error ? err : new Error('Could not load more watches.'));
      });
    return () => {
      cancelled = true;
    };
  }, [wantMore, seen, filterKey, userId, attempt, limit, filters, queryClient]);

  const refetch = useCallback(() => {
    attempts.current = 0;
    setRefillError(null);
    return query.refetch();
  }, [query]);

  return {
    ...query,
    data: visible,
    error: query.error ?? (visible.length === 0 ? refillError : null),
    refetch,
  };
}

export type ListingCounts = { matched: number; total: number };

export async function fetchCounts(filters: Filters): Promise<ListingCounts> {
  if (isDemo) return demo.counts(filters);

  const { data, error } = await supabase.rpc('listing_counts', {
    p_exclude_swiped: true,
    ...toRpcArgs(filters),
  });
  if (error) throw error;

  const row = data?.[0];
  return { matched: Number(row?.matched ?? 0), total: Number(row?.total ?? 0) };
}

/**
 * How many watches the filters leave, and how many the marketplace holds. The
 * pile cannot answer either: it is only the pages fetched so far, so its length
 * used to freeze at `DECK_LIMIT` and the header had to say "20+".
 *
 * Counted in the database, in one round trip, by `listing_counts` — the same
 * predicate the deck is drawn with. A count assembled here from the rows we
 * happen to hold would be a different number from the deck's the moment a
 * dealer is approved.
 */
export function useListingCounts() {
  const { filters } = useFilters('deck');

  return useQuery({
    queryKey: keys.counts(filters),
    queryFn: () => fetchCounts(filters),
    // `matched` moves in the cache the moment a swipe lands (`useRecordSwipe`).
    // This fetch is the correction, not the animation: a minute is long enough
    // that a swipe does not wait on it.
    staleTime: 60_000,
  });
}

export function useSaved(userId: string | null) {
  return useQuery({
    queryKey: keys.saved(userId ?? 'anonymous'),
    queryFn: () => fetchSaved(userId!),
    enabled: Boolean(userId),
  });
}

export function useListing(listingId: string) {
  return useQuery({
    queryKey: keys.listing(listingId),
    queryFn: () => fetchListing(listingId),
    enabled: Boolean(listingId),
  });
}

/** Unclaimed shops only accept email about a specific watch. This picks one when the thread has none yet. */
export function useDealerInquiryListing(dealerId: string | null) {
  return useQuery({
    queryKey: keys.dealerInquiryListing(dealerId ?? 'none'),
    enabled: Boolean(dealerId),
    queryFn: async (): Promise<DeckCard | null> => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('dealer_id', dealerId!)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [card] = await hydrate([data]);
      return card ?? null;
    },
  });
}
