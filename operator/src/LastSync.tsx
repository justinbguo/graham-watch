import { useEffect, useState } from 'react';

import { formatPrice, photoUrl } from './importer';
import { additionTitle, lastSyncDetail, lastSyncLabel, type LastSyncCell } from './lastSync';
import { supabase, type Database } from './supabase';

type Addition = Database['public']['Functions']['operator_last_sync_listings']['Returns'][number];

export function LastSyncButton({
  cell,
  expanded,
  onToggle,
}: {
  cell: LastSyncCell;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = lastSyncLabel(cell);
  return (
    <button
      type="button"
      className={cell.kind === 'never' ? 'sync-count never' : 'sync-count'}
      aria-expanded={expanded}
      aria-label={
        cell.kind === 'never'
          ? 'New on last sync, never synced'
          : `New on last sync, ${label}`
      }
      onClick={onToggle}>
      {label}
    </button>
  );
}

export function LastSyncDetail({ dealerId, cell }: { dealerId: string; cell: LastSyncCell }) {
  const [rows, setRows] = useState<Addition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cell.kind !== 'count') return;
    let live = true;
    void (async () => {
      const result = await supabase.rpc('operator_last_sync_listings', { p_dealer_id: dealerId });
      if (!live) return;
      setError(result.error?.message ?? null);
      setRows(result.data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [cell.kind, dealerId]);

  return (
    <div className="last-sync">
      <p className="muted small">{lastSyncDetail(cell)}</p>
      {cell.kind !== 'count' ? null : error ? (
        <p className="error">{error}</p>
      ) : rows === null ? (
        <p className="muted small">Loading…</p>
      ) : (
        <ul className="last-sync-list">
          {rows.map((row) => {
            const title = additionTitle(row.brand, row.model);
            const thumb = row.thumb_path ? photoUrl(row.thumb_path) : row.thumb_source_url;
            return (
              <li key={row.id}>
                {thumb ? <img src={thumb} alt="" /> : <span className="thumb-gap" aria-hidden="true" />}
                <span className="last-sync-copy">
                  <strong>{title}</strong>
                  <span className="muted small">
                    {formatPrice(row.price_cents, row.currency)}
                    {' · '}
                    {new Date(row.added_at).toLocaleString()}
                  </span>
                  <span className="last-sync-links">
                    {row.source_url ? (
                      <a href={row.source_url} target="_blank" rel="noreferrer">
                        Listing
                      </a>
                    ) : (
                      <span className="muted small">No listing link</span>
                    )}
                    {row.shop_url ? (
                      <a href={row.shop_url} target="_blank" rel="noreferrer">
                        Shop
                      </a>
                    ) : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
