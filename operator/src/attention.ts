/**
 * One list of what an operator should look at, built from reads the console
 * already has plus the refresh ledger. The database decides quiet, unanswered,
 * and stale. This decides how those facts become one row each, so the nav
 * badge and the screen cannot disagree.
 */

import { REFRESH_GAP_MS, type RefreshRun } from './refreshHealth.ts';

export type AttentionKind =
  | 'application'
  | 'unanswered'
  | 'quiet'
  | 'refresh_missing'
  | 'refresh_failed'
  | 'refresh_dealer'
  | 'listing_photo'
  | 'listing_stale';

export type AttentionItem = {
  kind: AttentionKind;
  id: string;
  dealerId: string | null;
  label: string;
  detail: string;
};

export type AttentionDealer = {
  id: string;
  name: string;
  website: string | null;
  permission: string;
  neglect_flags: string[] | null;
  unanswered_count: number;
  listings_missing_photos: number;
};

export type AttentionApplication = {
  id: string;
  shop_name: string;
  created_at: string;
};

export type StaleShop = {
  dealer_id: string;
  name: string;
  stale_count: number;
};

export type AttentionInput = {
  now: number;
  applications: AttentionApplication[];
  dealers: AttentionDealer[];
  runs: RefreshRun[];
  stale: StaleShop[];
  /** The history function is not on this database, so an empty ledger is not "missing". */
  runsUnavailable?: boolean;
};

function inWindow(iso: string, now: number): boolean {
  const time = Date.parse(iso);
  return Number.isFinite(time) && now - time <= REFRESH_GAP_MS && now - time >= 0;
}

function newestByDealer(runs: RefreshRun[], now: number): Map<string, RefreshRun> {
  const map = new Map<string, RefreshRun>();
  for (const run of runs) {
    if (!inWindow(run.finished_at, now)) continue;
    const held = map.get(run.dealer_id);
    if (!held || Date.parse(run.finished_at) > Date.parse(held.finished_at)) map.set(run.dealer_id, run);
  }
  return map;
}

function refreshItems(input: AttentionInput): AttentionItem[] {
  if (input.runsUnavailable) return [];

  const window = input.runs.filter((run) => inWindow(run.finished_at, input.now));
  if (window.length === 0) {
    return [
      {
        kind: 'refresh_missing',
        id: 'refresh_missing',
        dealerId: null,
        label: 'No catalogue refresh in 24 hours',
        detail: 'The nightly job did not record a run. Shop errors are not available until one lands.',
      },
    ];
  }

  const items: AttentionItem[] = [];
  const fatal = window.filter((run) => run.fatal && !run.skipped).length;
  const errored = window.filter((run) => !run.ok && !run.fatal && !run.skipped).length;
  const ok = window.filter((run) => run.ok && !run.fatal && !run.skipped).length;
  if (fatal > 0 || (ok === 0 && errored > 0)) {
    items.push({
      kind: 'refresh_failed',
      id: 'refresh_failed',
      dealerId: null,
      label: 'Catalogue refresh failed',
      detail: `${ok} ok, ${fatal} fatal, ${errored} error in the last 24 hours.`,
    });
  }

  const newest = newestByDealer(input.runs, input.now);
  for (const run of newest.values()) {
    if (run.skipped || (run.ok && !run.fatal)) continue;
    items.push({
      kind: 'refresh_dealer',
      id: `refresh_dealer:${run.dealer_id}`,
      dealerId: run.dealer_id,
      label: run.dealer_name,
      detail: run.error ?? (run.fatal ? 'The refresh stopped on this shop.' : 'The refresh failed for this shop.'),
    });
  }

  for (const dealer of input.dealers) {
    if (dealer.permission !== 'approved' || !dealer.website) continue;
    if (newest.has(dealer.id)) continue;
    items.push({
      kind: 'refresh_dealer',
      id: `refresh_dealer:${dealer.id}`,
      dealerId: dealer.id,
      label: dealer.name,
      detail: 'No refresh recorded for this shop in 24 hours.',
    });
  }

  return items;
}

/**
 * Pending applications, unanswered threads, quiet dealers, refresh trouble,
 * and listing problems. Unclaimed alone is not on this list: the Dealers
 * filter already has it, and nobody is waiting.
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [...refreshItems(input)];

  const applications = [...input.applications].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  for (const application of applications) {
    items.push({
      kind: 'application',
      id: `application:${application.id}`,
      dealerId: null,
      label: application.shop_name,
      detail: 'Dealer application waiting on an answer.',
    });
  }

  const dealers = [...input.dealers].sort((a, b) => a.name.localeCompare(b.name));
  for (const dealer of dealers) {
    if (dealer.unanswered_count > 0) {
      const waiting = dealer.unanswered_count;
      items.push({
        kind: 'unanswered',
        id: `unanswered:${dealer.id}`,
        dealerId: dealer.id,
        label: dealer.name,
        detail: `${waiting} ${waiting === 1 ? 'inquiry or thread' : 'inquiries or threads'} waiting 48 hours with no reply.`,
      });
    }
    if ((dealer.neglect_flags ?? []).includes('quiet')) {
      items.push({
        kind: 'quiet',
        id: `quiet:${dealer.id}`,
        dealerId: dealer.id,
        label: dealer.name,
        detail: 'The person who claimed this shop has not signed in for 14 days.',
      });
    }
    if (dealer.permission === 'approved' && dealer.listings_missing_photos > 0) {
      const missing = dealer.listings_missing_photos;
      items.push({
        kind: 'listing_photo',
        id: `listing_photo:${dealer.id}`,
        dealerId: dealer.id,
        label: dealer.name,
        detail: `${missing} active listing${missing === 1 ? '' : 's'} with no photo.`,
      });
    }
  }

  const stale = [...input.stale].sort((a, b) => b.stale_count - a.stale_count || a.name.localeCompare(b.name));
  for (const shop of stale) {
    if (shop.stale_count <= 0) continue;
    items.push({
      kind: 'listing_stale',
      id: `listing_stale:${shop.dealer_id}`,
      dealerId: shop.dealer_id,
      label: shop.name,
      detail: `${shop.stale_count} active listing${shop.stale_count === 1 ? '' : 's'} not availability-checked in 48 hours.`,
    });
  }

  return items;
}
