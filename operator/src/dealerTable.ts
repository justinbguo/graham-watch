import { dealerLastSyncAt } from './refreshSchedule.ts';

/**
 * What the Dealers table shows after the search box, the two filters, and a
 * column sort. The database returns every shop; this is the only place that
 * decides the order on screen, so the tests can pin it without a browser.
 */

export type ShopStatus = 'pending' | 'approved' | 'paused' | 'revoked';

export type NeglectFlag = 'unclaimed' | 'quiet' | 'unanswered';

export type FlagFilter = 'all' | 'neglected' | NeglectFlag | 'last_error';

export type SortKey = 'newest' | 'name' | 'status' | 'listings' | 'last_sync' | 'last_error' | 'flags';

export type DealerRow = {
  id: string;
  name: string;
  website: string | null;
  permission: ShopStatus;
  created_at: string;
  listings_held: number;
  last_refresh_ok_at?: string | null;
  last_synced_at?: string | null;
  last_refresh_error: string | null;
  last_sync_error: string | null;
  neglect_flags: string[] | null;
};

const STATUS_ORDER: ShopStatus[] = ['pending', 'approved', 'paused', 'revoked'];

export function shopErrors(dealer: Pick<DealerRow, 'last_refresh_error' | 'last_sync_error'>): string[] {
  return [...new Set([dealer.last_refresh_error, dealer.last_sync_error].filter((item): item is string => Boolean(item)))];
}

export function isNeglected(dealer: Pick<DealerRow, 'neglect_flags'>): boolean {
  return (dealer.neglect_flags ?? []).length > 0;
}

export function visibleDealers<T extends DealerRow>(
  rows: T[],
  query: string,
  status: 'all' | ShopStatus,
  flag: FlagFilter,
  sort: SortKey,
): T[] {
  const needle = query.trim().toLowerCase();
  const matched = rows.filter((dealer: T) => {
    if (status !== 'all' && dealer.permission !== status) return false;
    if (!matchesFlag(dealer, flag)) return false;
    if (!needle) return true;
    return (
      dealer.name.toLowerCase().includes(needle) ||
      (dealer.website ?? '').toLowerCase().includes(needle)
    );
  });

  return [...matched].sort((a, b) => compareDealers(a, b, sort));
}

function matchesFlag(dealer: DealerRow, flag: FlagFilter): boolean {
  const flags = dealer.neglect_flags ?? [];
  if (flag === 'all') return true;
  if (flag === 'neglected') return flags.length > 0;
  if (flag === 'last_error') return shopErrors(dealer).length > 0;
  return flags.includes(flag);
}

function compareDealers(a: DealerRow, b: DealerRow, sort: SortKey): number {
  if (sort === 'name') return a.name.localeCompare(b.name) || byNewest(a, b);
  if (sort === 'status') {
    return STATUS_ORDER.indexOf(a.permission) - STATUS_ORDER.indexOf(b.permission) || byNewest(a, b);
  }
  if (sort === 'listings') return b.listings_held - a.listings_held || byNewest(a, b);
  if (sort === 'last_sync') {
    const aAt = syncSortKey(a);
    const bAt = syncSortKey(b);
    return aAt - bAt || byNewest(a, b);
  }
  if (sort === 'last_error') {
    const aErr = shopErrors(a).length > 0 ? 0 : 1;
    const bErr = shopErrors(b).length > 0 ? 0 : 1;
    return aErr - bErr || shopErrors(a)[0]?.localeCompare(shopErrors(b)[0] ?? '') || byNewest(a, b);
  }
  if (sort === 'flags') {
    const aFlags = a.neglect_flags?.length ?? 0;
    const bFlags = b.neglect_flags?.length ?? 0;
    return bFlags - aFlags || byNewest(a, b);
  }
  return byNewest(a, b);
}

function byNewest(a: DealerRow, b: DealerRow): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** Missing sync sorts oldest-first (0) so neglected shops rise to the top. */
function syncSortKey(dealer: DealerRow): number {
  const at = dealerLastSyncAt(dealer);
  return at ? new Date(at).getTime() : 0;
}
