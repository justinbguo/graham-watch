import { useQuery } from '@tanstack/react-query';

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
      .select('id, name, website')
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

async function fetchDeck(limit: number): Promise<DeckCard[]> {
  if (isDemo) return demo.deck().slice(0, limit);

  const { data, error } = await supabase.rpc('get_deck', { p_limit: limit });
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

export function useDeck(limit = 20) {
  return useQuery({
    queryKey: keys.deck,
    queryFn: () => fetchDeck(limit),
    // The deck is consumed by swiping, not by refetching. Re-running it mid-pile
    // would shuffle cards out from under the user's thumb.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
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
