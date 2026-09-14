/** Calling the importer. Shared by import, sweep and dealers. */

import { request } from './_supabase.mjs';

// A guard on a bug, not a limit on a shop. Each pass reports what is left, so
// the loop normally ends because the queue emptied.
const MAX_PASSES = 200;

async function call(body, token, failure) {
  const { ok, body: result, status } = await request('/functions/v1/import-listings', {
    token,
    method: 'POST',
    body,
  });

  if (!ok) throw new Error(result?.error ?? `${failure} (${status}).`);
  return result;
}

/** Reads a catalogue and returns what is on it, writing nothing. */
export function preview({ sourceUrl, limit, token }) {
  return call({ action: 'preview', sourceUrl, limit }, token, 'Preview failed');
}

/**
 * Reads the shop's catalogue into source_items: what it sells, at what price,
 * and what it has since sold. No model call, so this is safe to run often.
 */
export function syncCatalog({ sourceUrl, dealerId, dealerName, dealerEmail, token }) {
  return call(
    { action: 'sync', sourceUrl, dealerId, dealerName, dealerEmail },
    token,
    'Refresh failed'
  );
}

/**
 * Marks catalogue rows for publishing, oldest first. Watches already in the
 * deck are marked from the moment they are adopted, so this only ever picks up
 * ones the shop has not published here yet.
 */
export async function choose({ dealerId, limit, token }) {
  const available = await request(
    `/rest/v1/source_items?dealer_id=eq.${dealerId}&listing_id=is.null&available=is.true&publish=is.false&select=id&order=first_seen_at${
      limit ? `&limit=${limit}` : ''
    }`,
    { token }
  );

  const ids = (available.body ?? []).map((row) => row.id);
  if (!ids.length) return 0;

  const { ok, body, status } = await request(
    `/rest/v1/source_items?id=in.(${ids.join(',')})`,
    {
      token,
      method: 'PATCH',
      body: { publish: true, error: null },
      prefer: 'return=representation',
    }
  );

  if (!ok) throw new Error(body?.error ?? `Could not choose watches (${status}).`);
  return body?.length ?? 0;
}

/**
 * Drains the publish queue, one bounded batch per call.
 *
 * The batch is what keeps each request inside its wall clock; the loop is what
 * makes the shop's size irrelevant. A batch that fails leaves everything before
 * it published and the rest still queued.
 */
export async function publishAll({ dealerId, token, onProgress }) {
  const totals = { processed: 0, published: 0, skipped: 0, failed: 0, pending: 0 };

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const batch = await call({ action: 'publish', dealerId }, token, 'Publish failed');

    totals.processed += batch.processed;
    totals.published += batch.published;
    totals.skipped += batch.skipped;
    totals.failed += batch.failed;
    totals.pending = batch.pending;

    onProgress?.(totals);
    if (batch.pending === 0 || batch.processed === 0) break;
  }

  return totals;
}

export function formatPrice(cents, currency) {
  if (!cents) return 'on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
