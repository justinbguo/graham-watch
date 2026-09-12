import type { DeckCard, ImportJob, Listing, ListingPhoto, SwipeDirection } from './database.types';
import { supabase } from './supabase';

async function attachPhotos(listings: Listing[]): Promise<DeckCard[]> {
  if (listings.length === 0) return [];

  const { data, error } = await supabase
    .from('listing_photos')
    .select('*')
    .in(
      'listing_id',
      listings.map((l) => l.id)
    )
    .order('position');
  if (error) throw error;

  const byListing = new Map<string, ListingPhoto[]>();
  for (const photo of data ?? []) {
    const bucket = byListing.get(photo.listing_id) ?? [];
    bucket.push(photo);
    byListing.set(photo.listing_id, bucket);
  }

  return listings.map((listing) => ({ ...listing, photos: byListing.get(listing.id) ?? [] }));
}

export async function fetchDeck(limit = 20): Promise<DeckCard[]> {
  const { data, error } = await supabase.rpc('get_deck', { p_limit: limit });
  if (error) throw error;
  return attachPhotos(data ?? []);
}

export async function recordSwipe(actorId: string, listingId: string, direction: SwipeDirection) {
  const { error } = await supabase
    .from('swipes')
    .upsert({ actor_id: actorId, listing_id: listingId, direction }, { onConflict: 'actor_id,listing_id' });
  if (error) throw error;
}

export async function fetchSaved(actorId: string): Promise<DeckCard[]> {
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

  return attachPhotos(ordered);
}

export async function unsave(actorId: string, listingId: string) {
  const { error } = await supabase
    .from('swipes')
    .delete()
    .eq('actor_id', actorId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

export async function fetchMyListings(sellerId: string): Promise<DeckCard[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachPhotos(data ?? []);
}

export async function fetchImportJobs(userId: string): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function startImport(sourceUrl: string): Promise<ImportJob> {
  const { data, error } = await supabase.functions.invoke<{ job: ImportJob }>('import-listings', {
    body: { sourceUrl },
  });
  if (error) throw error;
  if (!data?.job) throw new Error('Import did not start.');
  return data.job;
}
