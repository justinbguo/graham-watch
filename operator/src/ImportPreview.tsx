import { useEffect, useMemo, useState } from 'react';

import { ImportActivityLog } from './ImportActivityLog';
import {
  CANDIDATE_LIMIT,
  formatPrice,
  importCandidates,
  type CandidateState,
  type ImportCandidate,
} from './importer';

type Props = {
  dealerId: string;
  dealerName: string;
  /** What the read that opened this found, when a read opened it. */
  note: string | null;
  importing?: boolean;
  activityLog?: string[];
  onClearLog?: () => void;
  onClose: () => void;
  onImport: (candidates: ImportCandidate[]) => void;
};

/** What you can act on in this screen. Live watches are counted above, not listed here. */
type Filter = 'new' | 'queued' | 'failed';

const FILTERS: { key: Filter; label: string; hint: string }[] = [
  { key: 'new', label: 'New', hint: 'On their site, not staged yet' },
  { key: 'queued', label: 'Staged', hint: 'Will import when you confirm' },
  { key: 'failed', label: 'Failed', hint: 'Last import attempt did not finish' },
];

const MIN_PHOTOS = 3;

export function ImportPreview({
  dealerId,
  dealerName,
  note,
  importing = false,
  activityLog = [],
  onClearLog,
  onClose,
  onImport,
}: Props) {
  const [rows, setRows] = useState<ImportCandidate[] | null>(null);
  const [editing, setEditing] = useState<ImportCandidate | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void importCandidates(dealerId)
      .then((candidates) => {
        if (live) setRows(candidates);
      })
      .catch((caught) => {
        if (live) setError(caught instanceof Error ? caught.message : 'Could not load watches.');
      });
    return () => {
      live = false;
    };
  }, [dealerId]);

  const counts = useMemo(() => tally(rows ?? []), [rows]);
  const activeFilter = filter ?? (rows ? preferredFilter(counts) : 'queued');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        row.state === activeFilter &&
        (!needle ||
          row.title.toLowerCase().includes(needle) ||
          row.sourceUrl.toLowerCase().includes(needle))
    );
  }, [activeFilter, query, rows]);

  const selected = rows?.filter((row) => row.selected && row.state !== 'imported') ?? [];
  const selectable = shown.filter((row) => row.state !== 'imported');
  const allShownChosen = selectable.length > 0 && selectable.every((row) => row.selected);

  const patch = (id: string, change: Partial<ImportCandidate>) =>
    setRows((current) => (current ?? []).map((row) => (row.id === id ? { ...row, ...change } : row)));

  function chooseShown(wanted: boolean) {
    const ids = new Set(selectable.map((row) => row.id));
    setRows((current) =>
      (current ?? []).map((row) => (ids.has(row.id) ? { ...row, selected: wanted } : row))
    );
  }

  function selectAllNew() {
    setRows((current) =>
      (current ?? []).map((row) => (row.state === 'new' ? { ...row, selected: true } : row))
    );
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!importing) onClose();
      }}>
      <section
        className={importing || activityLog.length > 0 ? 'import-modal import-modal-busy' : 'import-modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header import-header">
          <div>
            <p className="eyebrow">Import watches</p>
            <h1 id="import-title">{dealerName}</h1>
            <p className="muted small">
              {note ??
                'Tick what should go live in the buyer deck, then confirm. Reading the site is free; import runs one AI pass per watch.'}
            </p>
            {rows ? (
              <p className="import-stats muted small">
                <span className="import-stat">
                  <strong>{counts.imported}</strong> live in deck
                </span>
                <span className="import-stat">
                  <strong>{counts.queued}</strong> staged
                </span>
                <span className="import-stat">
                  <strong>{counts.new}</strong> new on site
                </span>
                {counts.failed > 0 ? (
                  <span className="import-stat">
                    <strong>{counts.failed}</strong> failed
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            className="icon-button"
            aria-label="Close this shop's catalogue"
            disabled={importing}
            onClick={onClose}>
            ×
          </button>
        </header>

        <div className="review-toolbar">
          <div className="tabs" role="tablist" aria-label="Catalogue filters">
            {FILTERS.map((one) => (
              <button
                key={one.key}
                role="tab"
                aria-selected={activeFilter === one.key}
                className={activeFilter === one.key ? 'tab on' : 'tab'}
                title={one.hint}
                onClick={() => setFilter(one.key)}>
                {one.label} ({counts[one.key]})
              </button>
            ))}
          </div>

          <input
            className="search"
            value={query}
            placeholder="Find a watch"
            onChange={(event) => setQuery(event.target.value)}
          />

          <button
            className="ghost"
            disabled={selectable.length === 0}
            onClick={() => chooseShown(!allShownChosen)}>
            {allShownChosen ? 'Clear tab' : `Select tab (${selectable.length})`}
          </button>
        </div>

        {error ? <p className="error modal-message">{error}</p> : null}
        {rows === null && !error ? <p className="muted modal-message">Reading the catalogue…</p> : null}

        {rows && shown.length === 0 ? (
          <div className="empty-state">
            <h2>{emptyTitle(activeFilter, counts)}</h2>
            <p className="muted">{emptyBody(activeFilter, counts)}</p>
            {activeFilter === 'new' && counts.queued > 0 ? (
              <button className="ghost" onClick={() => setFilter('queued')}>
                Open staged ({counts.queued})
              </button>
            ) : null}
            {activeFilter === 'queued' && counts.new > 0 ? (
              <button className="ghost" onClick={() => setFilter('new')}>
                Review new on site ({counts.new})
              </button>
            ) : null}
          </div>
        ) : null}

        {rows && shown.length > 0 ? (
          <div className="candidate-list">
            {shown.map((row) => {
              const chooseable = row.state !== 'imported';
              const photos = photoNote(row.photoUrls.length);

              return (
                <article className="candidate" key={row.id}>
                  <label className="candidate-pick">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={!chooseable}
                      aria-label={`Import ${row.title}`}
                      onChange={(event) => patch(row.id, { selected: event.target.checked })}
                    />
                  </label>

                  <div className="candidate-copy">
                    <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                      <strong>{row.title}</strong>
                    </a>
                    <p className="muted small">
                      {formatPrice(row.priceCents, row.currency)}
                      <span className="candidate-sep"> · </span>
                      <span className={photos.ok ? 'muted' : 'warn-text'}>{photos.text}</span>
                    </p>
                    {row.description ? (
                      <p className="candidate-description">{row.description}</p>
                    ) : null}
                    {row.error ? <p className="error small">{row.error}</p> : null}
                  </div>

                  <div className="candidate-actions">
                    <span className={stateBadgeClass(row.state)}>{stateBadgeLabel(row.state)}</span>
                    {chooseable ? (
                      <button className="ghost" onClick={() => setEditing(row)}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        <ImportActivityLog
          lines={activityLog}
          busy={importing}
          onClear={onClearLog}
          title="Import progress"
        />

        <footer className="modal-footer">
          <p className="muted small import-footer-note">
            {footerNote(activeFilter, selected.length, counts)}
            {rows?.length === CANDIDATE_LIMIT ? ` Showing the ${CANDIDATE_LIMIT} most recent.` : ''}
          </p>
          <div className="footer-actions">
            {activeFilter === 'new' && counts.new > 0 ? (
              <button className="ghost" onClick={selectAllNew}>
                Select all new ({counts.new})
              </button>
            ) : null}
            <button className="ghost" disabled={importing} onClick={onClose}>
              Cancel
            </button>
            <button
              disabled={importing || selected.length === 0}
              onClick={() => rows && onImport(rows)}>
              {importing
                ? 'Importing…'
                : `Import ${selected.length || ''} watch${selected.length === 1 ? '' : 'es'}`}
            </button>
          </div>
        </footer>

        {editing ? (
          <CandidateEditor
            candidate={editing}
            onCancel={() => setEditing(null)}
            onSave={(candidate) => {
              patch(candidate.id, candidate);
              setEditing(null);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function photoNote(count: number): { text: string; ok: boolean } {
  if (count >= MIN_PHOTOS) {
    return { text: `${count} photos`, ok: true };
  }
  return {
    text: `${count} photo${count === 1 ? '' : 's'} — need ${MIN_PHOTOS} to publish`,
    ok: false,
  };
}

function stateBadgeLabel(state: CandidateState): string {
  if (state === 'new') return 'New';
  if (state === 'queued') return 'Staged';
  if (state === 'failed') return 'Failed';
  return 'Live';
}

function stateBadgeClass(state: CandidateState): string {
  if (state === 'queued') return 'badge wait';
  if (state === 'failed') return 'badge bad';
  if (state === 'imported') return 'badge ok';
  return 'badge';
}

function preferredFilter(counts: ReturnType<typeof tally>): Filter {
  if (counts.new > 0) return 'new';
  if (counts.queued > 0) return 'queued';
  if (counts.failed > 0) return 'failed';
  return 'new';
}

function emptyTitle(filter: Filter, counts: ReturnType<typeof tally>): string {
  if (filter === 'new') return counts.new === 0 ? 'Nothing new to stage' : 'No matches';
  if (filter === 'queued') return counts.queued === 0 ? 'Nothing staged yet' : 'No matches';
  return counts.failed === 0 ? 'No failed imports' : 'No matches';
}

function emptyBody(filter: Filter, counts: ReturnType<typeof tally>): string {
  if (filter === 'new' && counts.new === 0) {
    return counts.queued > 0
      ? 'Every for-sale watch is either staged or already live. Open Staged to import.'
      : 'Every for-sale watch is already live in the deck, or the catalogue is empty.';
  }
  if (filter === 'queued' && counts.queued === 0) {
    return 'Tick watches on New, or use Sync after the shop adds stock.';
  }
  if (filter === 'failed' && counts.failed === 0) {
    return 'Failed watches show here with the error from the last attempt.';
  }
  return 'Try another tab or clear the search box.';
}

function footerNote(filter: Filter, selected: number, counts: ReturnType<typeof tally>): string {
  if (selected === 0) {
    if (counts.queued > 0 && filter !== 'queued') {
      return `${counts.queued} staged — open that tab or import from View listings.`;
    }
    return 'Tick watches to import. Uncheck staged rows you want to skip.';
  }
  return `${selected} selected. Import re-checks the site for sold watches before spending.`;
}

function tally(rows: ImportCandidate[]): Record<Filter | 'imported', number> {
  return {
    new: rows.filter((row) => row.state === 'new').length,
    queued: rows.filter((row) => row.state === 'queued').length,
    imported: rows.filter((row) => row.state === 'imported').length,
    failed: rows.filter((row) => row.state === 'failed').length,
  };
}

function CandidateEditor({
  candidate,
  onCancel,
  onSave,
}: {
  candidate: ImportCandidate;
  onCancel: () => void;
  onSave: (candidate: ImportCandidate) => void;
}) {
  const [draft, setDraft] = useState(candidate);
  const [price, setPrice] = useState(
    candidate.priceCents === null ? '' : String(candidate.priceCents / 100)
  );
  function save() {
    const dollars = price.trim() === '' ? null : Number(price);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars < 0)) return;

    onSave({
      ...draft,
      priceCents: dollars === null ? null : Math.round(dollars * 100),
      currency: draft.currency?.trim().toUpperCase() || null,
      photoUrls: draft.photoUrls,
      selected: true,
      edited: true,
    });
  }

  return (
    <div className="editor-backdrop" role="presentation">
      <section className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header>
          <p className="eyebrow">Edit before importing</p>
          <h2 id="editor-title">{candidate.title}</h2>
        </header>
        <label>
          Title
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <div className="field-row">
          <label>
            Price
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              maxLength={3}
              value={draft.currency ?? ''}
              onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            rows={5}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <div className="footer-actions">
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button disabled={!draft.title.trim()} onClick={save}>
            Save changes
          </button>
        </div>
      </section>
    </div>
  );
}
