import { useEffect, useState } from 'react';

import { attentionItems, type AttentionDealer, type StaleShop } from './attention';
import { refreshBanner, type RefreshBanner, type RefreshRun } from './refreshHealth';
import { supabase } from './supabase';

const MIGRATION_NOTE =
  'Refresh history is not on this database yet. Apply the new migration with npm run db:push, after a dump.';

type PostgrestError = { code?: string; message?: string } | null;

function schemaMiss(error: PostgrestError): boolean {
  return error?.code === 'PGRST202' || error?.code === 'PGRST205';
}

export type Pulse = {
  banner: RefreshBanner;
  items: ReturnType<typeof attentionItems>;
  runs: RefreshRun[];
  runsUnavailable: boolean;
  error: string | null;
};

export async function loadPulse(now = Date.now()): Promise<Pulse> {
  const [dealers, applications, runs, stale] = await Promise.all([
    supabase.rpc('operator_dealers'),
    supabase
      .from('dealer_applications')
      .select('id, shop_name, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase.rpc('operator_refresh_runs', { p_limit: 400 }),
    supabase.rpc('operator_stale_listings'),
  ]);

  const runsUnavailable = schemaMiss(runs.error);
  const staleUnavailable = schemaMiss(stale.error);
  const failures = [dealers.error, applications.error, runsUnavailable ? null : runs.error, staleUnavailable ? null : stale.error]
    .map((error) => error?.message)
    .filter((message): message is string => Boolean(message));

  const runRows: RefreshRun[] = (runs.data ?? []).map((row) => ({
    dealer_id: row.dealer_id,
    dealer_name: row.dealer_name,
    finished_at: row.finished_at,
    ok: row.ok,
    fatal: row.fatal,
    skipped: row.skipped,
    error: row.error,
  }));
  const dealerRows: AttentionDealer[] = (dealers.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    website: row.website,
    permission: row.permission,
    neglect_flags: row.neglect_flags,
    unanswered_count: row.unanswered_count,
    listings_missing_photos: row.listings_missing_photos,
  }));
  const staleRows: StaleShop[] = (stale.data ?? []).map((row) => ({
    dealer_id: row.dealer_id,
    name: row.name,
    stale_count: Number(row.stale_count),
  }));

  const note = runsUnavailable || staleUnavailable ? MIGRATION_NOTE : null;

  return {
    banner: runsUnavailable
      ? {
          tone: 'bad',
          title: 'Refresh history is not on this database',
          detail: 'Apply the new migration with npm run db:push, after a dump. Until then a missed night stays invisible.',
          missing: true,
          lastSuccessAt: null,
          lastRunAt: null,
        }
      : refreshBanner(runRows, now),
    items: attentionItems({
      now,
      applications: applications.data ?? [],
      dealers: dealerRows,
      runs: runsUnavailable ? [] : runRows,
      stale: staleRows,
      runsUnavailable,
    }),
    runs: runRows,
    runsUnavailable,
    error: [note, failures[0]].filter(Boolean).join(' ') || null,
  };
}

export function usePulse(enabled: boolean, reloadKey: string) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void loadPulse()
      .then((next) => {
        if (live) setPulse(next);
      })
      .catch((caught: unknown) => {
        if (!live) return;
        const message = caught instanceof Error ? caught.message : 'Could not load.';
        setPulse({
          banner: {
            tone: 'bad',
            title: 'Could not check the refresh',
            detail: message,
            missing: true,
            lastSuccessAt: null,
            lastRunAt: null,
          },
          items: [],
          runs: [],
          runsUnavailable: false,
          error: message,
        });
      });
    return () => {
      live = false;
    };
  }, [enabled, reloadKey, tick]);

  return { pulse, reload: () => setTick((value) => value + 1) };
}
