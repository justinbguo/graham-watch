import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useGuest } from '@/features/auth/GuestProvider';
import { useFilters } from '@/features/filters/provider';
import { toRpcArgs, type Filters } from '@/features/filters/types';
import type { DeckCard, DeckPhoto, Listing, ListingPhoto } from '@/lib/models';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import { keys } from './keys';

const PHOTO_BUCKET = 'listing-photos';

/** Our copy when we have one, the dealer's own file when a copy failed. */
function display(photo: ListingPhoto): DeckPhoto {
  const url = photo.storage_path
    ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photo.storage_path).data.publicUrl
    : photo.source_url;

  return { ...photo, url };
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

async function fetchDeck(limit: number, filters: Filters): Promise<DeckCard[]> {
  if (isDemo) return demo.deck(filters).slice(0, limit);

  // The deck is search with the cards you have already judged removed, and with
  // the brands you chose at sign-up dealt first.
  const { data, error } = await supabase.rpc('search_listings', {
    p_limit: limit,
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
 * One pile at a time. The deck is not paged: it is fetched once, swiped down,
 * and refilled by a refresh, so this is also the most a screen can truthfully
 * say is left.
 */
export const DECK_LIMIT = 20;

export function useDeck(limit = DECK_LIMIT) {
  const { filters } = useFilters('deck');
  const guest = useGuest();

  const query = useQuery({
    queryKey: keys.deck(filters),
    queryFn: () => fetchDeck(limit, filters),
    // The deck is consumed by swiping, not by refetching. Re-running it mid-pile
    // would shuffle cards out from under the user's thumb.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Guest judgments never reach `swipes`, so the RPC cannot exclude them. Drop
  // them here so a refetch after a filter change does not resurrect a pass.
  const data = useMemo(() => {
    if (!query.data || guest.swipedIds.size === 0) return query.data;
    return query.data.filter((card) => !guest.swipedIds.has(card.id));
  }, [query.data, guest.swipedIds]);

  return { ...query, data };
}

export type ListingCounts = { matched: number; total: number };

async function fetchCounts(filters: Filters): Promise<ListingCounts> {
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
 * deck cannot answer either: it is one pile deep, so its length tops out at
 * `DECK_LIMIT` and the header had to say "20+".
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
