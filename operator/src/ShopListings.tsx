import { useEffect, useMemo, useState } from 'react';

import {
  CANDIDATE_LIMIT,
  deleteListing,
  formatPrice,
  importCandidates,
  type ImportCandidate,
} from './importer';
import { ListingEditor } from './ListingEditor';
import { confirmDelete, confirmWrite, supabase, type Database } from './supabase';

type Listing = Database['public']['Functions']['operator_listings']['Returns'][number];
type View = 'active' | 'available';

const SITE_FILTERS = [
  { key: 'new' as const, label: 'Not imported' },
  { key: 'queued' as const, label: 'Staged' },
  { key: 'failed' as const, label: 'Failed' },
  { key: 'all' as const, label: 'All on site' },
];

/** Imported watches you manage, plus for-sale rows from their site catalogue. */
export function ShopListings({
  dealerId,
  inDeck,
  catalogTotal,
  canImport,
  reload,
  onChanged,
  onImport,
}: {
  dealerId: string;
  inDeck: number;
  catalogTotal: number;
  canImport: boolean;
  reload: number;
  onChanged: () => void;
  onImport: (candidates: ImportCandidate[]) => void;
}) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [candidateLoad, setCandidateLoad] = useState<{ key: string; rows: ImportCandidate[] } | null>(
    null,
  );
  const [view, setView] = useState<View>('active');
  const [siteFilter, setSiteFilter] = useState<'new' | 'queued' | 'failed' | 'all'>('new');
  const [siteQuery, setSiteQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Listing | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = await supabase.rpc('operator_listings', { p_dealer_id: dealerId });
      if (!live) return;
      setError(rows.error?.message ?? null);
      setListings(rows.data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [dealerId, reload]);

  const candidateKey = `${dealerId}:${reload}`;
  const candidates =
    view === 'available' && candidateLoad?.key === candidateKey ? candidateLoad.rows : null;

  useEffect(() => {
    if (view !== 'available') return;
    let live = true;
    const key = `${dealerId}:${reload}`;
    void importCandidates(dealerId)
      .then((rows) => {
        if (live) setCandidateLoad({ key, rows });
      })
      .catch((caught) => {
        if (live) {
          setError(caught instanceof Error ? caught.message : 'Could not read the catalogue.');
        }
      });
    return () => {
      live = false;
    };
  }, [dealerId, reload, view]);

  const deckListings = useMemo(
    () =>
      (listings ?? []).filter(
        (listing) => listing.status === 'active' && !listing.sold_at,
      ),
    [listings],
  );

  const shownListings = deckListings;

  const siteShown = useMemo(() => {
    const needle = siteQuery.trim().toLowerCase();
    return (candidates ?? []).filter((row) => {
      if (siteFilter !== 'all' && row.state !== siteFilter) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.sourceUrl.toLowerCase().includes(needle)
      );
    });
  }, [candidates, siteFilter, siteQuery]);

  const siteCounts = useMemo(() => {
    const rows = candidates ?? [];
    return {
      new: rows.filter((row) => row.state === 'new').length,
      queued: rows.filter((row) => row.state === 'queued').length,
      failed: rows.filter((row) => row.state === 'failed').length,
      all: rows.length,
    };
  }, [candidates]);

  const selectedSite = candidates?.filter((row) => row.selected && row.state !== 'imported') ?? [];

  const nameOf = (listing: Listing) =>
    [listing.brand, listing.model].filter(Boolean).join(' ') || 'this watch';

  async function run(listing: Listing, work: () => Promise<void>) {
    setBusyId(listing.id);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusyId(null);
    }
  }

  function setStatus(listing: Listing, hidden: boolean) {
    const name = nameOf(listing);
    const asked = hidden
      ? `Hide ${name}? Buyers stop seeing it. A refresh will not show it again. You can show it later.`
      : `Show ${name} again?`;
    if (!confirmWrite(asked)) return;
    void run(listing, async () => {
      const { error: failed } = await supabase.rpc('operator_set_listing_status', {
        p_listing_id: listing.id,
        p_status: hidden ? 'hidden' : 'active',
      });
      if (failed) throw failed;
    });
  }

  function setSold(listing: Listing, sold: boolean) {
    const name = nameOf(listing);
    const asked = sold
      ? `Mark ${name} sold? The nightly refresh will not put it back on sale.`
      : `Mark ${name} available again? The next refresh can mark it sold if the shop's site says so.`;
    if (!confirmWrite(asked)) return;
    void run(listing, async () => {
      const { error: failed } = await supabase.rpc('operator_set_listing_sold', {
        p_listing_id: listing.id,
        p_sold: sold,
      });
      if (failed) throw failed;
    });
  }

  function remove(listing: Listing) {
    const name = nameOf(listing);
    const losses = [
      listing.saved_count > 0 ? `${listing.saved_count} on wishlists` : '',
      listing.inquiry_count > 0 ? `${listing.inquiry_count} inquiry(s)` : '',
    ].filter(Boolean);

    const asked = [
      `Delete ${name} for good?`,
      losses.length ? `This also deletes ${losses.join(' and ')}.` : '',
      "The shop's catalogue keeps it, so it can be imported again.",
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!confirmDelete(asked)) return;

    void run(listing, async () => {
      await deleteListing(listing.id);
    });
  }

  function patchCandidate(id: string, change: Partial<ImportCandidate>) {
    setCandidateLoad((current) =>
      current && current.key === candidateKey
        ? { ...current, rows: current.rows.map((row) => (row.id === id ? { ...row, ...change } : row)) }
        : current,
    );
  }

  function chooseAllSite(wanted: boolean) {
    const ids = new Set(
      siteShown.filter((row) => row.state !== 'imported').map((row) => row.id),
    );
    setCandidateLoad((current) =>
      current && current.key === candidateKey
        ? {
            ...current,
            rows: current.rows.map((row) => (ids.has(row.id) ? { ...row, selected: wanted } : row)),
          }
        : current,
    );
  }

  if (error) return <p className="error">{error}</p>;
  if (listings === null) return <p className="muted">Loading…</p>;

  return (
    <div className="detail inventory">
      <div className="inventory-bar">
        <div className="tabs inventory-tabs">
          <button
            className={view === 'active' ? 'tab on' : 'tab'}
            onClick={() => setView('active')}
            title="Active, unsold imports — what buyers can see when the shop is published">
            Active ({inDeck})
          </button>
          <button
            className={view === 'available' ? 'tab on' : 'tab'}
            onClick={() => setView('available')}
            title="For sale on their site right now (sold catalogue rows are excluded)">
            On site ({catalogTotal})
          </button>
        </div>
      </div>

      {view === 'available' ? (
        <SitePanel
          canImport={canImport}
          candidates={candidates}
          counts={siteCounts}
          filter={siteFilter}
          query={siteQuery}
          selectedCount={selectedSite.length}
          shown={siteShown}
          onChooseAll={chooseAllSite}
          onFilter={setSiteFilter}
          onImport={() => candidates && onImport(candidates)}
          onPatch={patchCandidate}
          onQuery={setSiteQuery}
        />
      ) : shownListings.length === 0 ? (
        <p className="muted inventory-empty">
          No active watches. Use On site to import, or Sync to refresh their catalogue.
        </p>
      ) : (
        <table className="inner listings">
          <thead>
            <tr>
              <th>Watch</th>
              <th className="num">Price</th>
              <th>State</th>
              <th className="actions-head">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shownListings.map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                busy={busyId !== null}
                busyId={busyId}
                onEdit={() => setEditing(listing)}
                onRemove={() => remove(listing)}
                onSold={() => setSold(listing, !listing.sold_at)}
                onStatus={() => setStatus(listing, listing.status !== 'hidden')}
              />
            ))}
          </tbody>
        </table>
      )}

      {editing ? (
        <ListingEditor
          listing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function ListingRow({
  listing,
  busy,
  busyId,
  onEdit,
  onRemove,
  onSold,
  onStatus,
}: {
  listing: Listing;
  busy: boolean;
  busyId: string | null;
  onEdit: () => void;
  onRemove: () => void;
  onSold: () => void;
  onStatus: () => void;
}) {
  const name = [listing.brand, listing.model].filter(Boolean).join(' ');

  return (
    <tr>
      <td>
        <a
          href={listing.source_url ?? '#'}
          target="_blank"
          rel="noreferrer"
          title={listing.description ?? undefined}>
          <strong>{name || 'unnamed'}</strong>
        </a>
        <span className="muted small oneline">
          {[
            listing.reference ? `ref ${listing.reference}` : null,
            listing.year ? String(listing.year) : null,
            listing.case_size_mm ? `${listing.case_size_mm}mm` : null,
            listing.condition,
          ]
            .filter(Boolean)
            .join(' · ') || 'no details'}
        </span>
      </td>
      <td className="num">{formatPrice(listing.price_cents, listing.currency)}</td>
      <td>
        {listing.sold_at ? (
          <span className="badge wait">sold</span>
        ) : listing.status === 'active' ? (
          <span className="badge ok">active</span>
        ) : (
          <span className="badge wait">{listing.status}</span>
        )}
      </td>
      <td className="actions">
        <div className="listing-actions">
          <button
            type="button"
            className="ghost row-btn"
            disabled={busy}
            title={
              listing.status === 'hidden'
                ? 'Show this watch in the buyer deck again.'
                : 'Hide from buyers until you show it again.'
            }
            onClick={onStatus}>
            {listing.status === 'hidden' ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            className="ghost row-btn"
            disabled={busy}
            title="Edit title, price, and other fields buyers see."
            onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className="ghost row-btn"
            disabled={busy}
            title={
              listing.sold_at
                ? 'Mark available again.'
                : 'Mark sold — nightly refresh will not relist it.'
            }
            onClick={onSold}>
            {listing.sold_at ? 'Available' : 'Sold'}
          </button>
          <button
            type="button"
            className="ghost row-btn danger-text"
            disabled={busy}
            title="Permanent. Prefer Hide when you can."
            onClick={onRemove}>
            {busyId === listing.id ? 'Working…' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}

function SitePanel({
  canImport,
  candidates,
  counts,
  filter,
  query,
  selectedCount,
  shown,
  onChooseAll,
  onFilter,
  onImport,
  onPatch,
  onQuery,
}: {
  canImport: boolean;
  candidates: ImportCandidate[] | null;
  counts: Record<'new' | 'queued' | 'failed' | 'all', number>;
  filter: 'new' | 'queued' | 'failed' | 'all';
  query: string;
  selectedCount: number;
  shown: ImportCandidate[];
  onChooseAll: (wanted: boolean) => void;
  onFilter: (filter: 'new' | 'queued' | 'failed' | 'all') => void;
  onImport: () => void;
  onPatch: (id: string, change: Partial<ImportCandidate>) => void;
  onQuery: (query: string) => void;
}) {
  const selectable = shown.filter((row) => row.state !== 'imported');
  const allChosen = selectable.length > 0 && selectable.every((row) => row.selected);

  return (
    <div className="site-panel">
      <div className="site-toolbar">
        <div className="tabs site-filters">
          {SITE_FILTERS.map((one) => (
            <button
              key={one.key}
              className={filter === one.key ? 'tab on' : 'tab'}
              onClick={() => onFilter(one.key)}>
              {one.label} ({counts[one.key]})
            </button>
          ))}
        </div>
        <input
          className="search site-search"
          value={query}
          placeholder="Find on site"
          onChange={(event) => onQuery(event.target.value)}
        />
        {canImport ? (
          <>
            <button
              type="button"
              className="ghost row-btn"
              disabled={selectable.length === 0}
              onClick={() => onChooseAll(!allChosen)}>
              {allChosen ? 'Clear' : 'Select all'}
            </button>
            <button
              type="button"
              className="row-btn"
              disabled={selectedCount === 0}
              title="Runs the model import for each ticked watch."
              onClick={onImport}>
              Import {selectedCount || ''}
            </button>
          </>
        ) : (
          <span className="muted small">Self-managed — catalogue is read-only here.</span>
        )}
      </div>

      {candidates === null ? (
        <p className="muted">Reading the catalogue…</p>
      ) : shown.length === 0 ? (
        <p className="muted">
          {candidates.length === 0
            ? 'No for-sale catalogue yet. Use Sync to read their site.'
            : 'Nothing matches this filter.'}
        </p>
      ) : (
        <ul className="rows site-rows">
          {shown.map((row) => {
            const pickable = row.state !== 'imported' && canImport;
            return (
              <li key={row.id} className="site-row">
                {pickable ? (
                  <input
                    type="checkbox"
                    checked={row.selected}
                    aria-label={`Import ${row.title}`}
                    onChange={(event) => onPatch(row.id, { selected: event.target.checked })}
                  />
                ) : (
                  <span className="site-check-placeholder" aria-hidden="true" />
                )}
                <div className="grow min-0">
                  <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                    <strong className="oneline">{row.title}</strong>
                  </a>
                  <span className="muted small oneline">
                    {formatPrice(row.priceCents, row.currency)}
                    {row.state === 'imported'
                      ? ' · already imported'
                      : row.state === 'failed'
                        ? ` · ${row.error ?? 'failed'}`
                        : row.state === 'queued'
                          ? ' · staged for import'
                          : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {candidates && candidates.length === CANDIDATE_LIMIT ? (
        <p className="muted small">Showing the {CANDIDATE_LIMIT} most recent items from their site.</p>
      ) : null}
    </div>
  );
}
