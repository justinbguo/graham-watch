/**
 * Calling the import function from the console.
 *
 * The same four actions the terminal tools use, so there is one implementation
 * of "read a shop" and this app cannot drift from `npm run dealers -- add`.
 *
 * Nothing here is safe to call in a loop without thought: `sync` reads a shop
 * we do not own and `importListings` spends a model call per watch. The screens
 * are what make each one deliberate.
 */

import { supabase } from './supabase';

export type Discovery = {
  origin: string;
  name: string;
  email: string | null;
  catalogUrl: string;
  productCount: number;
  platform: string;
  sawSitemap: boolean;
};

export type SyncResult = {
  dealerId: string;
  provider: string;
  found: number;
  added: number;
  changed: number;
  retired: number;
  complete: boolean;
};

export type PublishTotals = {
  processed: number;
  published: number;
  skipped: number;
  failed: number;
  pending: number;
};

/** A guard on a bug, not a limit on a shop. Each pass reports what is left. */
const MAX_PASSES = 200;

/**
 * `functions.invoke` swallows the body of a failed response and reports
 * "non-2xx status", which throws away the only useful part: the function says
 * why in `error`, and a 429 has to be told apart from a bad domain.
 */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Signed out. Reload and sign in again.');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-listings`,
    {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const text = await response.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const failure = new Error(parsed?.error ?? `The import function returned ${response.status}.`);
    // The bulk screen waits out a budget refusal and reports everything else,
    // so it has to be able to tell them apart.
    (failure as Error & { status?: number }).status = response.status;
    throw failure;
  }

  return parsed as T;
}

export function discoverShop(domain: string): Promise<Discovery> {
  return call<Discovery>({ action: 'discover', domain });
}

/**
 * Reads the shop's catalogue into source_items, creating the shop if it is new.
 *
 * Costs HTTP and nothing else on Shopify and Squarespace. New shops land at
 * `pending`, so this can never put a watch in front of a buyer.
 */
export function syncCatalog(input: {
  sourceUrl: string;
  dealerName?: string;
  dealerEmail?: string;
  dealerId?: string;
}): Promise<SyncResult> {
  return call<SyncResult>({ action: 'sync', ...input });
}

/**
 * Marks catalogue rows for import, oldest first, and returns how many.
 *
 * A patch rather than an RPC because that is what the terminal tool does, and
 * the policies behind it are the same. `can_import` on the shop is the caller's
 * warning that this would be refused.
 */
export async function queueForImport(dealerId: string, limit: number): Promise<number> {
  if (limit < 1) return 0;

  const { data: waiting, error: unread } = await supabase
    .from('source_items')
    .select('id')
    .eq('dealer_id', dealerId)
    .is('listing_id', null)
    .is('error', null)
    .eq('available', true)
    .eq('publish', false)
    .order('first_seen_at')
    .limit(limit);

  if (unread) throw unread;
  if (!waiting?.length) return 0;

  const { data, error } = await supabase
    .from('source_items')
    .update({ publish: true, error: null })
    .in(
      'id',
      waiting.map((row) => row.id)
    )
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Drains the import queue in bounded batches.
 *
 * The batch keeps each request inside its wall clock; the loop makes the shop's
 * size irrelevant. Closing the tab half way leaves the rest queued rather than
 * lost — `catalog_queued` on the shop is what is left, and running this again
 * picks it up.
 */
export async function importListings(
  dealerId: string,
  onProgress?: (totals: PublishTotals) => void
): Promise<PublishTotals> {
  const totals: PublishTotals = {
    processed: 0,
    published: 0,
    skipped: 0,
    failed: 0,
    pending: 0,
  };

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const batch = await call<PublishTotals>({ action: 'publish', dealerId });

    totals.processed += batch.processed;
    totals.published += batch.published;
    totals.skipped += batch.skipped;
    totals.failed += batch.failed;
    totals.pending = batch.pending;

    onProgress?.({ ...totals });
    if (batch.pending === 0 || batch.processed === 0) break;
  }

  return totals;
}

export function formatPrice(cents: number | null, currency: string | null): string {
  if (!cents) return 'on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** The bucket is public, so a path is all the client needs to show a photo. */
export function photoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`;
}
