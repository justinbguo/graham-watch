/** How long without a successful nightly refresh before the console warns. */
export const REFRESH_STALE_MS = 24 * 60 * 60 * 1000;

/** Per-shop "last sync" turns red at or beyond this age. */
export const LAST_SYNC_STALE_MS = 48 * 60 * 60 * 1000;

export type LastSyncTone = 'ok' | 'stale';

export function lastSyncTone(at: string | null, now = Date.now()): LastSyncTone {
  if (!at) return 'stale';
  const ms = now - new Date(at).getTime();
  return !Number.isFinite(ms) || ms >= LAST_SYNC_STALE_MS ? 'stale' : 'ok';
}

/** Newest catalogue read or successful nightly refresh — what "last sync" means in the table. */
export function dealerLastSyncAt(dealer: {
  last_refresh_ok_at?: string | null;
  last_synced_at?: string | null;
}): string | null {
  const times = [dealer.last_refresh_ok_at, dealer.last_synced_at]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((ms) => Number.isFinite(ms));
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

export type RefreshSchedule = {
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_attempt_ok: boolean | null;
  last_attempt_error: string | null;
  recorded_runs: number;
  approved_shops: number;
  last_catalog_sync_at: string | null;
};

export type RefreshAlert = {
  level: 'ok' | 'warn' | 'error';
  title: string;
  detail: string;
};

export function refreshIsStale(at: string | null, now = Date.now()): boolean {
  if (!at) return true;
  const ms = now - new Date(at).getTime();
  return !Number.isFinite(ms) || ms > REFRESH_STALE_MS;
}

/**
 * What the Dealers banner should say. Uses refresh_runs when present; falls
 * back to the newest clean catalogue read across approved shops.
 */
export function refreshAlert(schedule: RefreshSchedule, now = Date.now()): RefreshAlert {
  const ledgerSuccess = schedule.last_success_at;
  const fallbackSuccess = schedule.last_catalog_sync_at;
  const effectiveSuccess = ledgerSuccess ?? (schedule.recorded_runs === 0 ? fallbackSuccess : null);

  const stale = refreshIsStale(effectiveSuccess, now);
  const lastFailed =
    schedule.last_attempt_at != null &&
    schedule.last_attempt_ok === false &&
    Boolean(schedule.last_attempt_error);

  if (schedule.recorded_runs === 0 && schedule.approved_shops > 0) {
    if (stale) {
      return {
        level: 'error',
        title: 'No refresh history on file',
        detail:
          'The refresh_runs table is empty. Nightly jobs may be failing before they log, or migrations are not applied. ' +
          (fallbackSuccess
            ? `Last catalogue read across approved shops was ${formatWhen(fallbackSuccess, now)}.`
            : 'No successful catalogue read is recorded either.'),
      };
    }
  }

  if (stale) {
    return {
      level: 'error',
      title: 'Nightly refresh is overdue',
      detail: effectiveSuccess
        ? `Last success was ${formatWhen(effectiveSuccess, now)}. Approved shops should refresh within 24 hours.`
        : 'No successful nightly refresh is recorded.',
    };
  }

  if (lastFailed) {
    return {
      level: 'warn',
      title: 'Latest refresh attempt failed',
      detail: `${formatWhen(schedule.last_attempt_at!, now)} — ${schedule.last_attempt_error ?? 'unknown error'}. Last success ${ledgerSuccess ? formatWhen(ledgerSuccess, now) : 'not recorded'}.`,
    };
  }

  return {
    level: 'ok',
    title: 'Last successful nightly refresh',
    detail: ledgerSuccess
      ? formatWhen(ledgerSuccess, now)
      : fallbackSuccess
        ? `${formatWhen(fallbackSuccess, now)} (catalogue read; ledger empty)`
        : 'No run recorded yet',
  };
}

export function shopRefreshStale(
  dealer: {
    permission: string;
    last_refresh_ok_at: string | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
  },
  now = Date.now(),
): boolean {
  if (dealer.permission !== 'approved') return false;
  const okAt = dealer.last_refresh_ok_at;
  if (okAt) return refreshIsStale(okAt, now);
  if (dealer.last_sync_error) return true;
  return refreshIsStale(dealer.last_synced_at, now);
}

function formatWhen(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'under an hour ago';
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
