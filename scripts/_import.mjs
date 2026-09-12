/** Calling the importer and following the job it queues. Shared by import and dealers. */

import { request } from './_supabase.mjs';

const POLL_MS = 2000;
const TIMEOUT_MS = 180_000;

/** Extracts listings and returns them without writing anything. */
export async function preview({ sourceUrl, limit, token }) {
  const { ok, body, status } = await request('/functions/v1/import-listings', {
    token,
    method: 'POST',
    body: { sourceUrl, limit, dryRun: true },
  });

  if (!ok) throw new Error(body?.error ?? `Preview failed (${status}).`);
  return body;
}

export async function runImport({ sourceUrl, limit, dealerName, token, onProgress }) {
  const started = await request('/functions/v1/import-listings', {
    token,
    method: 'POST',
    body: { sourceUrl, limit, dealerName },
  });

  if (!started.ok) {
    throw new Error(started.body?.error ?? `Failed to queue (${started.status}).`);
  }

  let job = started.body.job;
  const deadline = Date.now() + TIMEOUT_MS;

  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() > deadline) {
      throw new Error(`Gave up after ${TIMEOUT_MS / 1000}s. Job ${job.id} is still ${job.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const polled = await request(`/rest/v1/import_jobs?id=eq.${job.id}`, { token });
    job = polled.body?.[0] ?? job;
    onProgress?.(job);
  }

  if (job.status === 'failed') throw new Error(job.error ?? 'Import failed.');
  return job;
}

export function formatPrice(cents, currency) {
  if (!cents) return 'on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
