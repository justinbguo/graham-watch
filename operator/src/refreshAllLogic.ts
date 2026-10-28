type PublishTotals = {
  processed: number;
  published: number;
  skipped: number;
  failed: number;
  pending: number;
};

type SyncResult = {
  forSale: number;
  added: number;
  retired: number;
};

export type RefreshShopTarget = { id: string; name: string; website: string };

/** Fields the refresh filter reads. Kept off the browser client so node tests can import this file. */
export type RefreshCandidate = {
  id: string;
  name: string;
  website: string | null;
  permission: string;
  can_import: boolean;
};

/** Approved shops the operator can read — same set the nightly job walks. */
export function shopsToRefresh(dealers: RefreshCandidate[]): RefreshShopTarget[] {
  return dealers
    .filter((dealer) => dealer.permission === 'approved' && dealer.website && dealer.can_import)
    .map((dealer) => ({ id: dealer.id, name: dealer.name, website: dealer.website! }));
}

export type RefreshShopResult = {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  sync?: SyncResult;
  publish?: PublishTotals;
};

export function summariseRefreshAll(results: RefreshShopResult[]): string {
  const ok = results.filter((row) => row.ok);
  const failed = results.filter((row) => !row.ok);
  const published = ok.reduce((sum, row) => sum + (row.publish?.published ?? 0), 0);
  const pending = ok.reduce((sum, row) => sum + (row.publish?.pending ?? 0), 0);

  const parts = [`Synced ${ok.length} of ${results.length} shop(s).`];
  if (published > 0) parts.push(`${published} listing(s) published.`);
  if (pending > 0) parts.push(`${pending} still queued — run Reload again or use Sync on that shop.`);
  if (failed.length > 0) parts.push(`${failed.length} failed: ${failed.map((row) => row.name).join(', ')}.`);
  return parts.join(' ');
}
