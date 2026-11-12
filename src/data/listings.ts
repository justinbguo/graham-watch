import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

import { useGuest } from '@/features/auth/GuestProvider';
import { useFilters } from '@/features/filters/provider';
import { canonicalize } from '@/features/filters/spec';
import type { Filters } from '@/features/filters/types';
import type { Json } from '@/lib/database';
import type { DeckCard, DeckPhoto, Listing, ListingPhoto } from '@/lib/models';
import { demo, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

import {
  DECK_FAVORITES_FIRST,
  DECK_LIMIT,
  DECK_SORT,
  newCardsOnLastPage,
  nextDeckCursor,
  shouldRefillDeck,
  showDeckEmpty,
  visibleDeckCards,
  type DeckCache,
  type DeckPage,
  type DeckSort,
} from './deckPaging';
import { keys } from './keys';
import { brandKey, emptySeed, emptyTaste, orderFeed, type RankSeed, type RankWatch } from './rank';

export { DECK_LIMIT, showDeckEmpty };

const PHOTO_BUCKET = 'listing-photos';

/** Shop columns a card and the Buy header both read. One string, three queries. */
export const DEALER_IDENTITY_COLUMNS =
  'id, name, website, description, instagram, logo_url' as const;

/** Our copy when we have one, the dealer's own file when a copy failed. */
export function listingPhotoUrl(photo: Pick<ListingPhoto, 'storage_path' | 'source_url'>): string {
  return photo.storage_path
    ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(photo.storage_path).data.publicUrl
    : photo.source_url;
}

function display(photo: ListingPhoto): DeckPhoto {
  return { ...photo, url: listingPhotoUrl(photo) };
}

// One `in` filter is a GET query string. A shop with a thousand watches
// makes a URL the gateway rejects, and the shop page then says it is gone.
const FILTER_CHUNK = 80;

async function rowsInChunks<T>(
  ids: string[],
  load: (ids: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += FILTER_CHUNK) {
    chunks.push(ids.slice(start, start + FILTER_CHUNK));
  }
  const pages = await Promise.all(
    chunks.map(async (slice) => {
      const { data, error } = await load(slice);
      if (error) throw error;
      return data ?? [];
    }),
  );
  return pages.flat();
}

/** Listings carry only a dealer_id; cards need the dealer's name and link too. */
export async function hydrate(listings: Listing[]): Promise<DeckCard[]> {
  if (listings.length === 0) return [];

  const listingIds = listings.map((listing) => listing.id);
  const dealerIds = [...new Set(listings.map((listing) => listing.dealer_id))];
  const [photos, dealers] = await Promise.all([
    rowsInChunks(listingIds, (ids) =>
      supabase.from('listing_photos').select('*').in('listing_id', ids).order('position'),
    ),
    rowsInChunks(dealerIds, (ids) =>
      supabase.from('dealers').select(DEALER_IDENTITY_COLUMNS).in('id', ids),
    ),
  ]);

  const photosByListing = new Map<string, DeckPhoto[]>();
  for (const photo of photos) {
    const bucket = photosByListing.get(photo.listing_id) ?? [];
    bucket.push(display(photo));
    photosByListing.set(photo.listing_id, bucket);
  }

  const dealerById = new Map(dealers.map((dealer) => [dealer.id, dealer]));

  return listings.map((listing) => ({
    ...listing,
    photos: photosByListing.get(listing.id) ?? [],
    dealer: dealerById.get(listing.dealer_id) ?? null,
  }));
}

/**
 * One page of the Buy deck.
 *
 * `p_spec` is the canonical filter: the same object `canonicalize()` returns,
 * not the panel's empty arrays. `p_cursor` is null on the first page and, after
 * that, the bookmark the previous page came back with. Demo mode has no
 * database, so it mints its own bookmark; the hook still treats that string
 * as opaque.
 */
function asRank(card: DeckCard): RankWatch {
  return {
    id: card.id,
    brandKey: card.brand_key ?? brandKey(card.brand),
    style: card.style,
    priceCents: card.price_cents,
    createdAtMs: Date.parse(card.created_at),
    dealerId: card.dealer_id,
    photoCount: card.photos.length,
  };
}

function orderDemo(cards: DeckCard[], seed: RankSeed): DeckCard[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return orderFeed(cards.map(asRank), emptyTaste(seed), Date.now())
    .map((watch) => byId.get(watch.id))
    .filter((card): card is DeckCard => card != null);
}

async function fetchDeckPage(
  limit: number,
  filters: Filters,
  cursor: string | null,
  _sort: DeckSort,
  _favoritesFirst: boolean,
  seed: RankSeed,
): Promise<DeckPage<DeckCard>> {
  if (isDemo) return demoDeckPage(filters, cursor, limit, seed);

  // The deck hides watches already judged, and a shop this account has claimed.
  // Importing a listing does not hide it. A guest has no account, so nothing
  // is theirs to hide and `swipes` has no rows for them. The cursor is what
  // moves a guest forward, the same way it moves a signed-in buyer. Sort and
  // favorites-first stay on the query key so a different order is still a
  // different pile.
  const { data, error } = await supabase.rpc('rank_buy_feed', {
    p_spec: canonicalize(filters).spec as Json,
    p_limit: limit,
    p_cursor: cursor,
    p_seed: {
      brands: [...seed.brands],
      styles: [...seed.styles],
      priceBand: seed.priceBand,
    },
  });
  if (error) throw error;

  const rows = data ?? [];
  return {
    cards: await hydrate(rows.map((row) => row.listing)),
    // One bookmark for the page. Null means there is no next page.
    cursor: rows[0]?.cursor ?? null,
  };
}

/** Stand-in for `rank_buy_feed` when the app is running on fixtures. */
function demoDeckPage(
  filters: Filters,
  cursor: string | null,
  limit: number,
  seed: RankSeed,
): DeckPage<DeckCard> {
  const all = orderDemo(demo.deck(filters), seed);
  let start = 0;
  if (cursor != null) {
    const id = cursor.startsWith('demo:') ? cursor.slice('demo:'.length) : '';
    const at = all.findIndex((card) => card.id === id);
    // The anchor was judged and dropped out of the fixture list. Stop, rather
    // than starting the pile over from the first watch.
    start = at >= 0 ? at + 1 : all.length;
  }
  const cards = all.slice(start, start + limit);
  const last = cards[cards.length - 1];
  const more = start + cards.length < all.length;
  return { cards, cursor: more && last ? `demo:${last.id}` : null };
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
 * One page at a time. On the cards, the next page is fetched when five or
 * fewer are left and the last page came back with a cursor. The grid shows
 * every card still in hand, so that pile never gets thin — the grid calls
 * `fetchNextPage` itself when its tail is on screen. Same query either way.
 *
 * The header does not count the pile: `listing_counts_v2` is the number of
 * watches, and the pile is only the ones in hand. The empty copy waits for
 * that count to be zero. An empty page, or a count that has not loaded, is
 * not the end of the catalogue.
 *
 * `useInfiniteQuery` keeps each page with the cursor that fetched it, under
 * the query key. Changing the filter or the sort changes the key, and the new
 * query starts at `initialPageParam: null` — the first page, not the previous
 * sort's bookmark.
 */
export function useDeck(limit = DECK_LIMIT, enabled = true) {
  const { filters, ready } = useFilters('deck');
  const guest = useGuest();
  const sort = DECK_SORT;
  const favoritesFirst = DECK_FAVORITES_FIRST;
  const seed = emptySeed();

  const query = useInfiniteQuery<
    DeckPage<DeckCard>,
    Error,
    DeckCache<DeckCard>,
    ReturnType<typeof keys.deck>,
    string | null
  >({
    queryKey: keys.deck(filters, sort, favoritesFirst),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchDeckPage(limit, filters, pageParam, sort, favoritesFirst, seed),
    getNextPageParam: (lastPage) => nextDeckCursor(lastPage),
    // The deck is consumed by swiping, not by refetching. Re-running the first
    // page mid-pile would shuffle cards out from under the user's thumb. The
    // next page is appended by the query, on purpose, and only while the key
    // is unchanged.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: enabled && ready,
  });

  const visible = useMemo(
    () => visibleDeckCards(query.data, guest.swipedIds),
    [query.data, guest.swipedIds],
  );

  const latestPageAdded = newCardsOnLastPage(query.data);

  const wantMore =
    enabled &&
    query.data != null &&
    shouldRefillDeck({
      remaining: visible.length,
      hasNextPage: query.hasNextPage,
      latestPageAdded,
    });

  useEffect(() => {
    // A failed next page stays failed until Try again. Calling again here
    // would spin on the same cursor while the cards still in hand are fine.
    if (!wantMore || query.isFetchingNextPage || query.isFetchNextPageError) return;
    void query.fetchNextPage();
  }, [wantMore, query.isFetchingNextPage, query.isFetchNextPageError, query.fetchNextPage]);

  const refetch = useCallback(() => query.refetch(), [query.refetch]);

  return {
    ...query,
    data: visible,
    // A failed refill must not replace the watch under the thumb. The screen
    // shows the error once the pile is empty, and Try again is that screen's
    // existing button. The first page's error has no cards to protect.
    error: visible.length === 0 ? query.error : null,
    refetch,
    // The grid's scroll asks `shouldLoadMoreGrid` with this. A page that
    // added nothing must not be asked for again, or the tail would spin.
    latestPageAdded,
  };
}

export type ListingCounts = { matched: number; total: number };

export async function fetchCounts(filters: Filters): Promise<ListingCounts> {
  if (isDemo) return demo.counts(filters);

  const { data, error } = await supabase.rpc('listing_counts_v2', {
    p_spec: canonicalize(filters).spec as Json,
    p_exclude_swiped: true,
    // The deck hides a claimed shop. The count has to use that same cut, or
    // the header would include a watch the pile will never show.
    p_exclude_own: true,
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
 * Counted in the database, in one round trip, by `listing_counts_v2` — the same
 * `listing_matches` predicate the deck is drawn with. A count assembled here
 * from the rows we happen to hold would be a different number from the deck's
 * the moment a dealer is approved. Sort is not part of this key: order does
 * not change how many watches match.
 */
export function useListingCounts(enabled = true) {
  const { filters } = useFilters('deck');

  return useQuery({
    queryKey: keys.counts(filters),
    queryFn: () => fetchCounts(filters),
    enabled,
    // `matched` moves in the cache the moment a swipe lands (`useRecordSwipe`).
    // This fetch is the correction, not the animation: a minute is long enough
    // that a swipe does not wait on it.
    staleTime: 60_000,
  });
}

export function useSaved(userId: string | null) {
  const guest = useGuest();
  return useQuery({
    queryKey: keys.saved(userId ?? 'anonymous'),
    queryFn: () => fetchSaved(userId!),
    enabled: Boolean(userId) && !guest.settling,
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
