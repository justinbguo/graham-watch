import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  useChooseCatalogItems,
  useDealerCatalog,
  usePublishBatch,
  useSyncCatalog,
  type CatalogItem,
  type SyncResult,
} from '@/data/dealers';

/**
 * A guard, not a limit. Each pass publishes a bounded slice and reports what is
 * left, so the loop ends when the queue empties. This only stops a bug on the
 * server from spinning the client forever.
 */
const MAX_PASSES = 200;

export type ImportStage = 'reading' | 'choosing' | 'publishing' | 'done';

export type Progress = { done: number; total: number };

/**
 * Refreshing a shop, in two halves.
 *
 * The catalogue read costs HTTP and nothing else, so it runs on open and covers
 * the whole shop. Typing a watch costs a model call, so it happens only for the
 * ones the dealer ticks, in batches the client drives until the queue is empty.
 * Splitting them is what lets a shop with hundreds of watches import at all.
 */
export function useCatalogImport(dealerId: string | undefined, sourceUrl: string | undefined) {
  const sync = useSyncCatalog(dealerId ?? null);
  const catalog = useDealerCatalog(dealerId ?? null);
  const choose = useChooseCatalogItems(dealerId ?? null);
  const publish = usePublishBatch(dealerId ?? null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [summary, setSummary] = useState<SyncResult | null>(null);
  const [publishError, setPublishError] = useState<Error | null>(null);
  const [stage, setStage] = useState<ImportStage>('reading');

  const requested = useRef<string | null>(null);
  const { mutateAsync: runSync } = sync;

  // One read per shop URL per visit. The mutation is not a query, so nothing
  // else stops a re-render from asking the dealer's site again.
  useEffect(() => {
    if (!dealerId || !sourceUrl) return;
    const key = `${dealerId}:${sourceUrl}`;
    if (requested.current === key) return;
    requested.current = key;

    setStage('reading');
    runSync(sourceUrl)
      .then(setSummary)
      .catch(() => undefined)
      .finally(() => setStage('choosing'));
  }, [dealerId, runSync, sourceUrl]);

  const rows = catalog.data ?? [];

  // Everything the shop sells that is not in the deck yet, ticked to begin
  // with. Seeded once per read so a refetch does not undo the dealer's choices.
  useEffect(() => {
    if (stage !== 'choosing' || !catalog.data || !sourceUrl) return;
    if (seededFor === sourceUrl) return;

    setSelected(
      new Set(catalog.data.filter((row) => !row.listed && row.available).map((row) => row.id))
    );
    setSeededFor(sourceUrl);
  }, [catalog.data, seededFor, sourceUrl, stage]);

  const toggle = useCallback((item: CatalogItem) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  const selectAllNew = useCallback(
    () => setSelected(new Set(rows.filter((row) => !row.listed && row.available).map((row) => row.id))),
    [rows]
  );

  const selectNone = useCallback(() => setSelected(new Set()), []);

  const chosen = useMemo(
    () => rows.filter((row) => selected.has(row.id) && !row.listed),
    [rows, selected]
  );

  // A watch already in the deck whose page the shop has since changed. It is
  // published either way, so the dealer is told rather than asked.
  const refreshing = useMemo(() => rows.filter((row) => row.listed && row.changed), [rows]);

  const { mutateAsync: setPublish } = choose;
  const { mutateAsync: runBatch } = publish;

  const start = useCallback(async () => {
    if (!chosen.length && !refreshing.length) return;

    setPublishError(null);
    setStage('publishing');
    const total = chosen.length + refreshing.length;
    setProgress({ done: 0, total });

    try {
      if (chosen.length) {
        await setPublish({ ids: chosen.map((row) => row.id), publish: true });
      }

      let done = 0;
      for (let pass = 0; pass < MAX_PASSES; pass += 1) {
        const batch = await runBatch();
        done += batch.processed;
        setProgress({ done, total: Math.max(total, done + batch.pending) });
        if (batch.pending === 0 || batch.processed === 0) break;
      }
      setStage('done');
    } catch (error) {
      setPublishError(error instanceof Error ? error : new Error('Could not publish.'));
      // Whatever landed before the failure is already in the deck, and the
      // queue remembers the rest, so the dealer can pick up where it stopped.
      setStage('choosing');
    }
  }, [chosen, refreshing.length, runBatch, setPublish]);

  return {
    rows,
    chosen,
    refreshing,
    selected,
    stage,
    progress,
    summary,
    isLoading: stage === 'reading' || catalog.isLoading,
    error: sync.error ?? catalog.error ?? choose.error ?? publishError,
    toggle,
    selectAllNew,
    selectNone,
    start,
  };
}

export type CatalogImport = ReturnType<typeof useCatalogImport>;
export type { CatalogItem };
