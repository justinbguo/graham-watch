import { useEffect, useMemo, useState } from 'react';

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
  onClose: () => void;
  onImport: (candidates: ImportCandidate[]) => void;
};

type Filter = 'new' | 'queued' | 'imported' | 'failed' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'Not imported' },
  { key: 'queued', label: 'Queued' },
  { key: 'imported', label: 'In the deck' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'Everything' },
];

const STATE_LABEL: Record<CandidateState, string> = {
  new: 'not imported',
  queued: 'queued',
  imported: 'in the deck',
  failed: 'failed',
};

export function ImportPreview({ dealerId, dealerName, note, onClose, onImport }: Props) {
  const [rows, setRows] = useState<ImportCandidate[] | null>(null);
  const [editing, setEditing] = useState<ImportCandidate | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
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

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) =>
        (filter === 'all' || row.state === filter) &&
        (!needle ||
          row.title.toLowerCase().includes(needle) ||
          row.sourceUrl.toLowerCase().includes(needle))
    );
  }, [filter, query, rows]);

  const selected = rows?.filter((row) => row.selected) ?? [];
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

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">Choose what to import</p>
            <h1 id="import-title">{dealerName}</h1>
            <p className="muted small">
              {note ??
                'Everything this shop has for sale right now. Ticked watches are imported when you confirm.'}
            </p>
          </div>
          <button className="icon-button" aria-label="Close this shop's catalogue" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="review-toolbar">
          <div className="tabs">
            {FILTERS.map((one) => (
              <button
                key={one.key}
                className={filter === one.key ? 'tab on' : 'tab'}
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
            {allShownChosen ? 'Clear these' : `Select these ${selectable.length || ''}`}
          </button>
        </div>

        {error ? <p className="error modal-message">{error}</p> : null}
        {rows === null && !error ? <p className="muted modal-message">Reading the catalogue…</p> : null}

        {rows && shown.length === 0 ? (
          <div className="empty-state">
            <h2>Nothing here</h2>
            <p className="muted">
              {rows.length === 0
                ? 'We hold no catalogue for this shop yet. Refresh reads their site.'
                : 'No watch matches this filter.'}
            </p>
          </div>
        ) : null}

        {rows && shown.length > 0 ? (
          <div className="candidate-list">
            {shown.map((row) => {
              const chooseable = row.state !== 'imported';

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

                  {row.photoUrls[0] ? (
                    <img src={row.photoUrls[0]} alt="" loading="lazy" />
                  ) : (
                    <div className="candidate-placeholder">No photo</div>
                  )}

                  <div className="candidate-copy">
                    <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                      <strong>{row.title}</strong>
                    </a>
                    <p className="muted small">
                      {formatPrice(row.priceCents, row.currency)} · {row.photoUrls.length} photo
                      {row.photoUrls.length === 1 ? '' : 's'}
                    </p>
                    {row.description ? (
                      <p className="candidate-description">{row.description}</p>
                    ) : null}
                    {row.error ? <p className="error small">{row.error}</p> : null}
                  </div>

                  <div className="candidate-actions">
                    <span className={row.state === 'imported' ? 'badge ok' : 'badge'}>
                      {STATE_LABEL[row.state]}
                    </span>
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

        <footer className="modal-footer">
          <p className="muted small">
            {rows?.length === CANDIDATE_LIMIT
              ? `Showing the ${CANDIDATE_LIMIT} most recent. `
              : ''}
            Unticking a watch leaves it in the catalogue for later.
          </p>
          <div className="footer-actions">
            <button className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button disabled={selected.length === 0} onClick={() => rows && onImport(rows)}>
              Import {selected.length || ''} watch{selected.length === 1 ? '' : 'es'}
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

function tally(rows: ImportCandidate[]): Record<Filter, number> {
  return {
    new: rows.filter((row) => row.state === 'new').length,
    queued: rows.filter((row) => row.state === 'queued').length,
    imported: rows.filter((row) => row.state === 'imported').length,
    failed: rows.filter((row) => row.state === 'failed').length,
    all: rows.length,
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
  const [photos, setPhotos] = useState(candidate.photoUrls.join('\n'));

  function save() {
    const dollars = price.trim() === '' ? null : Number(price);
    if (dollars !== null && (!Number.isFinite(dollars) || dollars < 0)) return;

    onSave({
      ...draft,
      priceCents: dollars === null ? null : Math.round(dollars * 100),
      currency: draft.currency?.trim().toUpperCase() || null,
      photoUrls: photos
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean),
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
        <label>
          Photo links, one per line
          <textarea rows={5} value={photos} onChange={(event) => setPhotos(event.target.value)} />
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
