/**
 * What the console says about the nightly catalogue refresh.
 *
 * The ledger is one row per shop per run. Rows inserted together share
 * `finished_at` (one statement, one clock), and that shared timestamp is a
 * run. A catalogue read from the Dealers screen does not write a row, so it
 * cannot satisfy "last successful refresh".
 */

export const REFRESH_GAP_MS = 24 * 60 * 60 * 1000;

export type RefreshRun = {
  dealer_id: string;
  dealer_name: string;
  finished_at: string;
  ok: boolean;
  fatal: boolean;
  skipped: boolean;
  error: string | null;
};

export type RunGroup = {
  finished_at: string;
  ok: number;
  fatal: number;
  error: number;
  skipped: number;
  shops: RefreshRun[];
};

export type BannerTone = 'ok' | 'warn' | 'bad';

export type RefreshBanner = {
  tone: BannerTone;
  title: string;
  detail: string;
  missing: boolean;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
};

export function formatAge(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function countsAs(run: RefreshRun): 'skipped' | 'fatal' | 'error' | 'ok' {
  if (run.skipped) return 'skipped';
  if (run.fatal) return 'fatal';
  if (!run.ok) return 'error';
  return 'ok';
}

/** Newest run first. Shops that share `finished_at` are one run. */
export function groupRuns(runs: RefreshRun[]): RunGroup[] {
  const sorted = [...runs].sort(
    (a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at) || a.dealer_name.localeCompare(b.dealer_name),
  );
  const groups: RunGroup[] = [];
  for (const run of sorted) {
    let group = groups[groups.length - 1];
    if (!group || group.finished_at !== run.finished_at) {
      group = { finished_at: run.finished_at, ok: 0, fatal: 0, error: 0, skipped: 0, shops: [] };
      groups.push(group);
    }
    group.shops.push(run);
    group[countsAs(run)] += 1;
  }
  return groups;
}

function inWindow(run: RefreshRun, now: number): boolean {
  const time = Date.parse(run.finished_at);
  return Number.isFinite(time) && now - time <= REFRESH_GAP_MS && now - time >= 0;
}

function countPhrase(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function tallyRuns(runs: RefreshRun[]): string {
  let ok = 0;
  let fatal = 0;
  let error = 0;
  for (const run of runs) {
    const kind = countsAs(run);
    if (kind === 'ok') ok += 1;
    else if (kind === 'fatal') fatal += 1;
    else if (kind === 'error') error += 1;
  }
  return [countPhrase(ok, 'ok'), countPhrase(fatal, 'fatal'), countPhrase(error, 'error')].join(', ');
}

export function refreshBanner(runs: RefreshRun[], now: number): RefreshBanner {
  const groups = groupRuns(runs);
  const newest = groups[0] ?? null;
  const lastSuccess = runs
    .filter((run) => run.ok && !run.fatal && !run.skipped)
    .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))[0];
  const lastSuccessAt = lastSuccess?.finished_at ?? null;
  const window = runs.filter((run) => inWindow(run, now));
  const missing = window.length === 0;

  if (!newest) {
    return {
      tone: 'bad',
      title: 'No refresh recorded',
      detail: 'The nightly job has not written a run. A catalogue read on one shop is a different clock.',
      missing: true,
      lastSuccessAt: null,
      lastRunAt: null,
    };
  }

  const successClause = lastSuccessAt
    ? `Last success ${formatAge(lastSuccessAt, now)}.`
    : 'No successful refresh has been recorded.';

  if (missing) {
    return {
      tone: 'bad',
      title: 'No refresh in the last 24 hours',
      detail: `${successClause} Newest attempt ${formatAge(newest.finished_at, now)}.`,
      missing: true,
      lastSuccessAt,
      lastRunAt: newest.finished_at,
    };
  }

  const fatal = window.some((run) => run.fatal && !run.skipped);
  const shopError = window.some((run) => !run.ok && !run.fatal && !run.skipped);
  const age = formatAge(newest.finished_at, now);

  if (fatal) {
    return {
      tone: 'bad',
      title: 'Last refresh failed',
      detail: `${age} · ${tallyRuns(window)} in the last 24 hours. ${successClause}`,
      missing: false,
      lastSuccessAt,
      lastRunAt: newest.finished_at,
    };
  }

  if (shopError) {
    return {
      tone: 'warn',
      title: 'Refresh finished with shop errors',
      detail: `${age} · ${tallyRuns(window)} in the last 24 hours. ${successClause}`,
      missing: false,
      lastSuccessAt,
      lastRunAt: newest.finished_at,
    };
  }

  return {
    tone: 'ok',
    title: 'Last successful refresh',
    detail: `${age} · ${countPhrase(newest.ok, 'shop')} ok`,
    missing: false,
    lastSuccessAt,
    lastRunAt: newest.finished_at,
  };
}

export function shopProblems(group: RunGroup): string[] {
  return group.shops
    .filter((shop) => !shop.skipped && (shop.fatal || !shop.ok))
    .map((shop) => `${shop.dealer_name} — ${shop.error ?? (shop.fatal ? 'fatal' : 'failed')}`);
}
