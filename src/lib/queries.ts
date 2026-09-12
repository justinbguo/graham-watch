import type {
  Dealer,
  DeckCard,
  ImportJob,
  Inquiry,
  Listing,
  ListingPhoto,
  SwipeDirection,
} from './database.types';
import { supabase } from './supabase';

/** Listings carry only a dealer_id; cards need the dealer's name and link too. */
async function hydrate(listings: Listing[]): Promise<DeckCard[]> {
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

  const photosByListing = new Map<string, ListingPhoto[]>();
  for (const photo of photos.data ?? []) {
    const bucket = photosByListing.get(photo.listing_id) ?? [];
    bucket.push(photo);
    photosByListing.set(photo.listing_id, bucket);
  }

  const dealerById = new Map((dealers.data ?? []).map((d) => [d.id, d]));

  return listings.map((listing) => ({
    ...listing,
    photos: photosByListing.get(listing.id) ?? [],
    dealer: dealerById.get(listing.dealer_id) ?? null,
  }));
}

export async function fetchDeck(limit = 20): Promise<DeckCard[]> {
  const { data, error } = await supabase.rpc('get_deck', { p_limit: limit });
  if (error) throw error;
  return hydrate(data ?? []);
}

export async function recordSwipe(actorId: string, listingId: string, direction: SwipeDirection) {
  const { error } = await supabase
    .from('swipes')
    .upsert(
      { actor_id: actorId, listing_id: listingId, direction },
      { onConflict: 'actor_id,listing_id' }
    );
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

  return hydrate(ordered);
}

export async function fetchListing(listingId: string): Promise<DeckCard | null> {
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

export async function unsave(actorId: string, listingId: string) {
  const { error } = await supabase
    .from('swipes')
    .delete()
    .eq('actor_id', actorId)
    .eq('listing_id', listingId);
  if (error) throw error;
}

export async function fetchImportedListings(userId: string): Promise<DeckCard[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('imported_by', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return hydrate(data ?? []);
}

export async function fetchDealers(): Promise<Dealer[]> {
  const { data, error } = await supabase.from('dealers').select('*').order('name');
  if (error) throw error;
  return data ?? [];
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

export async function startImport(sourceUrl: string, dealerId?: string): Promise<ImportJob> {
  const { data, error } = await supabase.functions.invoke<{ job: ImportJob }>('import-listings', {
    body: { sourceUrl, dealerId },
  });
  if (error) throw error;
  if (!data?.job) throw new Error('Import did not start.');
  return data.job;
}

export async function fetchInquiries(buyerId: string): Promise<Inquiry[]> {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function sendInquiry(buyerId: string, card: DeckCard, message: string) {
  const { data, error } = await supabase
    .from('inquiries')
    .insert({
      listing_id: card.id,
      dealer_id: card.dealer_id,
      buyer_id: buyerId,
      message: message.trim() || null,
    })
    .select('*')
    .single();

  if (error) {
    // The unique index on (listing_id, buyer_id) is what stops repeat sends.
    if (error.code === '23505') throw new Error('You already contacted this dealer.');
    throw error;
  }
  return data;
}
