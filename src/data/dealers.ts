import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { NO_FILTERS } from '@/features/filters/types';
import { demo, isDemo } from '@/lib/demo';
import type { Database } from '@/lib/database';
import type { DeckCard, Listing } from '@/lib/models';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session';

import { hydrate } from './listings';
import { keys } from './keys';

export type DealerAccount =
  Database['public']['Functions']['dealer_accounts']['Returns'][number];

/** A shop found by the website a dealer typed, plus how they may prove it. */
export type ClaimableDealer =
  Database['public']['Functions']['lookup_claimable_dealer']['Returns'][number];

/** A card, so the shop's own list shows the same photograph a buyer sees. */
export type DealerInventoryItem = DeckCard & {
  saves: number;
  passes: number;
  inquiries: number;
};

/**
 * The columns a shop may correct on its own listing. `dealer_id` and
 * `imported_by` are absent on purpose: the update policy would reject a move to
 * another shop anyway, and nothing in the app has a reason to try.
 */
export type ListingEdits = Partial<
  Pick<
    Listing,
    | 'brand'
    | 'model'
    | 'reference'
    | 'year'
    | 'caliber'
    | 'winding'
    | 'case_size_mm'
    | 'case_material'
    | 'dial_color'
    | 'style'
    | 'complications'
    | 'condition'
    | 'has_box'
    | 'has_papers'
    | 'price_cents'
    | 'currency'
    | 'description'
    | 'source_url'
    | 'status'
    | 'sold_at'
  >
>;

async function fetchDealerAccounts(): Promise<DealerAccount[]> {
  if (isDemo) return [];

  const { data, error } = await supabase.rpc('dealer_accounts');
  if (error) throw error;
  return data ?? [];
}

async function fetchDealerInventory(dealerId: string): Promise<DealerInventoryItem[]> {
  const [listings, stats] = await Promise.all([
    supabase
      .from('listings')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false }),
    supabase.rpc('dealer_stats', { p_dealer_id: dealerId }),
  ]);

  if (listings.error) throw listings.error;
  if (stats.error) throw stats.error;

  const counts = new Map((stats.data ?? []).map((row) => [row.listing_id, row]));
  const cards = await hydrate(listings.data ?? []);

  return cards.map((card) => {
    const count = counts.get(card.id);
    return {
      ...card,
      saves: count?.saves ?? 0,
      passes: count?.passes ?? 0,
      inquiries: count?.inquiries ?? 0,
    };
  });
}

async function readFunctionError(error: unknown): Promise<string | null> {
  const response = (error as { context?: Response })?.context;
  if (!response) return null;

  try {
    return (await response.json())?.error ?? null;
  } catch {
    return null;
  }
}

export function useDealerAccounts() {
  const { isSignedIn, userId } = useSession();

  return useQuery({
    queryKey: keys.dealerAccounts(userId ?? 'anonymous'),
    queryFn: fetchDealerAccounts,
    enabled: isSignedIn,
  });
}

export function useClaimDealer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealerId: string) => {
      const { error } = await supabase.rpc('claim_dealer', { p_dealer_id: dealerId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dealer-accounts'] }),
  });
}

/**
 * Finds the shop behind a website. Returns null for no match rather than
 * throwing: "we don't list that shop" is an answer the screen shows, not a
 * failure.
 */
export function useClaimableDealer(website: string) {
  const trimmed = website.trim();

  return useQuery({
    queryKey: keys.claimableDealer(trimmed.toLowerCase()),
    queryFn: async (): Promise<ClaimableDealer | null> => {
      const { data, error } = await supabase.rpc('lookup_claimable_dealer', {
        p_website: trimmed,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    // A partly typed domain matches nothing, so wait for something host-shaped.
    enabled: /^(?:[a-z]+:\/\/)?[^\s.]+\.[^\s.]{2,}/i.test(trimmed),
  });
}

export function useRequestClaimCode() {
  return useMutation({
    // No `email` means the shop's published address: the server reads it so the
    // client never holds a contact address it is not entitled to see.
    mutationFn: async (input: { dealerId: string; email?: string }) => {
      const { data, error } = await supabase.functions.invoke<{
        sentTo: string;
        expiresAt: string;
      }>('claim-dealer', { body: input });

      if (error) throw new Error((await readFunctionError(error)) ?? error.message);
      return data!;
    },
  });
}

export function useVerifyClaimCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { dealerId: string; code: string }) => {
      const { data, error } = await supabase.rpc('claim_dealer_with_code', {
        p_dealer_id: input.dealerId,
        p_code: input.code.trim(),
      });
      if (error) throw error;
      // Null is a wrong code, not a failure: the attempt has to commit, so the
      // function cannot raise and still count the guess.
      if (!data) throw new Error('That code is not right.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dealer-accounts'] }),
  });
}

export function useDealerInventory(dealerId: string | null) {
  return useQuery({
    queryKey: keys.dealerInventory(dealerId ?? 'none'),
    queryFn: () => fetchDealerInventory(dealerId!),
    enabled: Boolean(dealerId),
    staleTime: 30_000,
  });
}

function patchInventoryItem(
  items: DealerInventoryItem[],
  listingId: string,
  changes: ListingEdits,
): DealerInventoryItem[] {
  return items.map((item) => (item.id === listingId ? { ...item, ...changes } : item));
}

export function useUpdateDealerListing(dealerId: string | null) {
  const queryClient = useQueryClient();
  const inventoryKey = keys.dealerInventory(dealerId ?? 'none');

  return useMutation({
    mutationFn: async ({
      listingId,
      changes,
    }: {
      listingId: string;
      changes: ListingEdits;
    }) => {
      const { error } = await supabase.from('listings').update(changes).eq('id', listingId);
      if (error) throw error;
    },
    onMutate: async ({ listingId, changes }) => {
      if (!dealerId) return;
      await queryClient.cancelQueries({ queryKey: inventoryKey });
      const previous = queryClient.getQueryData<DealerInventoryItem[]>(inventoryKey);
      if (previous) {
        queryClient.setQueryData(inventoryKey, patchInventoryItem(previous, listingId, changes));
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (dealerId && context?.previous) {
        queryClient.setQueryData(inventoryKey, context.previous);
      }
    },
    onSuccess: (_result, { listingId }) => {
      if (dealerId) {
        void queryClient.invalidateQueries({ queryKey: keys.dealerInventory(dealerId) });
      }
      queryClient.invalidateQueries({ queryKey: keys.listing(listingId) });
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
      queryClient.invalidateQueries({ queryKey: keys.facets });
    },
  });
}

export function useDeleteDealerListing(dealerId: string | null) {
  const queryClient = useQueryClient();
  const inventoryKey = keys.dealerInventory(dealerId ?? 'none');

  return useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase.from('listings').delete().eq('id', listingId);
      if (error) throw error;
    },
    onMutate: async (listingId) => {
      if (!dealerId) return;
      await queryClient.cancelQueries({ queryKey: inventoryKey });
      const previous = queryClient.getQueryData<DealerInventoryItem[]>(inventoryKey);
      if (previous) {
        queryClient.setQueryData(
          inventoryKey,
          previous.filter((item) => item.id !== listingId),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (dealerId && context?.previous) {
        queryClient.setQueryData(inventoryKey, context.previous);
      }
    },
    onSuccess: (_result, listingId) => {
      if (dealerId) {
        void queryClient.invalidateQueries({ queryKey: keys.dealerInventory(dealerId) });
      }
      queryClient.invalidateQueries({ queryKey: keys.listing(listingId) });
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
      queryClient.invalidateQueries({ queryKey: keys.facets });
    },
  });
}

async function invokeImport<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  if (isDemo) throw new Error('Importing is not available in the demo.');

  const result = await supabase.functions.invoke('import-listings', { body });
  if (result.error) {
    const reason = await readFunctionError(result.error);
    throw new Error(reason ?? fallback);
  }
  return result.data as T;
}

/** One product as the shop's own catalogue describes it, before we type it. */
export type SourceItem = Database['public']['Tables']['source_items']['Row'];

export type CatalogItem = {
  id: string;
  sourceUrl: string;
  title: string;
  priceCents: number | null;
  currency: string | null;
  photoUrl: string | null;
  photoCount: number;
  available: boolean;
  publish: boolean;
  /** Already in the deck, so ticking it is a refresh rather than an addition. */
  listed: boolean;
  /** The shop changed this watch since we last wrote it into the deck. */
  changed: boolean;
  error: string | null;
};

/** The shape the importer stores in `raw`, which is its own SourceItem type. */
type RawSourceItem = {
  title?: string;
  photoUrls?: string[];
  priceCents?: number | null;
  currency?: string | null;
};

function toCatalogItem(row: SourceItem): CatalogItem {
  const raw = (row.raw ?? {}) as RawSourceItem;
  const photos = raw.photoUrls ?? [];

  return {
    id: row.id,
    sourceUrl: row.source_url,
    title: raw.title ?? row.source_url,
    priceCents: raw.priceCents ?? null,
    currency: raw.currency ?? null,
    photoUrl: photos[0] ?? null,
    photoCount: photos.length,
    available: row.available,
    publish: row.publish,
    listed: row.listing_id !== null,
    changed: row.listing_id !== null && row.applied_hash !== row.content_hash,
    error: row.error,
  };
}

export function useDealerCatalog(dealerId: string | null) {
  return useQuery({
    queryKey: keys.dealerCatalog(dealerId ?? 'none'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('source_items')
        .select('*')
        .eq('dealer_id', dealerId!)
        .order('last_seen_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map(toCatalogItem);
    },
    enabled: Boolean(dealerId),
  });
}

export type SyncResult = {
  dealerId: string;
  provider: string;
  found: number;
  added: number;
  changed: number;
  adopted: number;
  retired: number;
  complete: boolean;
};

/**
 * Reads the shop's catalogue into our own table. No model call, so this is the
 * cheap half of a refresh and can walk the whole shop.
 */
export function useSyncCatalog(dealerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceUrl: string) =>
      invokeImport<SyncResult>(
        { action: 'sync', dealerId, sourceUrl: sourceUrl.trim() },
        'Could not read that shop.'
      ),
    onSuccess: () => {
      if (!dealerId) return;
      queryClient.invalidateQueries({ queryKey: keys.dealerCatalog(dealerId) });
      queryClient.invalidateQueries({ queryKey: keys.dealerInventory(dealerId) });
    },
  });
}

/** Ticking a watch is a write to our own row, so it needs no edge function. */
export function useChooseCatalogItems(dealerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, publish }: { ids: string[]; publish: boolean }) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from('source_items')
        // Clearing the error is what lets a dealer retry a watch that failed:
        // the publish queue skips any row holding one.
        .update({ publish, error: null })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      if (dealerId) queryClient.invalidateQueries({ queryKey: keys.dealerCatalog(dealerId) });
    },
  });
}

export type PublishBatch = {
  processed: number;
  published: number;
  skipped: number;
  failed: number;
  pending: number;
};

/**
 * Types and publishes one bounded slice of the queue. The caller keeps calling
 * while `pending` is above zero — which is what lets a 300-watch shop import at
 * all, rather than failing whenever one request runs out of wall clock.
 */
export function usePublishBatch(dealerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      invokeImport<PublishBatch>({ action: 'publish', dealerId }, 'Could not publish.'),
    onSuccess: () => {
      if (!dealerId) return;
      queryClient.invalidateQueries({ queryKey: keys.dealerCatalog(dealerId) });
      queryClient.invalidateQueries({ queryKey: keys.dealerInventory(dealerId) });
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
      queryClient.invalidateQueries({ queryKey: keys.facets });
    },
  });
}

export type DealerReputation =
  Database['public']['Functions']['dealer_reputation']['Returns'][number];

export function useDealerReputation(dealerId: string | null) {
  return useQuery({
    queryKey: keys.dealerReputation(dealerId ?? 'none'),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dealer_reputation', {
        p_dealer_id: dealerId!,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: Boolean(dealerId) && !isDemo,
  });
}

/** How many of a shop's other watches a card shows before offering the shop. */
export const DEALER_PREVIEW = 3;

/**
 * The shop's newest watches for sale, for the strip on a card. Fetches one
 * more than the strip shows so the watch being read can be dropped and the
 * strip still fill. Keyed by shop, not by card: every card from one dealer
 * shares the fetch.
 */
export function useDealerPreview(dealerId: string | null) {
  return useQuery({
    queryKey: keys.dealerPreview(dealerId ?? 'none'),
    queryFn: async (): Promise<DeckCard[]> => {
      if (isDemo) {
        return demo.search({ ...NO_FILTERS, dealers: [dealerId!] }).slice(0, DEALER_PREVIEW + 1);
      }

      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('dealer_id', dealerId!)
        .eq('status', 'active')
        .is('sold_at', null)
        .order('created_at', { ascending: false })
        .limit(DEALER_PREVIEW + 1);
      if (error) throw error;
      return hydrate(data ?? []);
    },
    enabled: Boolean(dealerId),
  });
}

/** The shop a buyer opens: who they are, and every watch they still have for sale. */
export function useDealerShop(dealerId: string) {
  return useQuery({
    queryKey: keys.dealerShop(dealerId),
    enabled: Boolean(dealerId),
    queryFn: async () => {
      if (isDemo) {
        const listings = demo.search({ ...NO_FILTERS, dealers: [dealerId] });
        return { dealer: listings[0]?.dealer ?? null, listings };
      }

      const [dealer, listings] = await Promise.all([
        supabase
          .from('dealers')
          .select('id, name, website, description, instagram, logo_url')
          .eq('id', dealerId)
          .maybeSingle(),
        supabase
          .from('listings')
          .select('*')
          .eq('dealer_id', dealerId)
          .eq('status', 'active')
          .is('sold_at', null)
          .order('created_at', { ascending: false }),
      ]);
      if (dealer.error) throw dealer.error;
      if (listings.error) throw listings.error;

      return { dealer: dealer.data, listings: await hydrate(listings.data ?? []) };
    },
  });
}
