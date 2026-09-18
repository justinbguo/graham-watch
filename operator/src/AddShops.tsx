import { useMemo, useRef, useState } from 'react';

import { parseShops, type Rejection } from './domains';
import { discoverShop, syncCatalog, type Discovery, type SyncResult } from './importer';
import { confirmWrite } from './supabase';

/**
 * Adding shops, one or forty.
 *
 * Two phases on purpose. Reading a site writes nothing, so every shop is read
 * first and shown as a table the operator can look at and cut rows from;
 * adding happens only after that. A single blind run over a pasted list is how
 * you end up with eleven shops named after their hostname and no way to tell
 * which of them was a typo.
 *
 * Adding a shop never puts a watch in front of a buyer. It creates the shop at
 * `pending` and reads its catalogue; importing watches and publishing the shop
 * are separate actions on Dealers, because those are the two that cost money
 * and change what buyers see.
 */

type RowState = 'waiting' | 'reading' | 'found' | 'unreadable' | 'adding' | 'added' | 'failed';

type Row = {
  domain: string;
  line: number;
  fromFileName?: string;
  fromFileEmail?: string;
  state: RowState;
  found?: Discovery;
  added?: SyncResult;
  error?: string;
  include: boolean;
};

/** Sites read at once. Enough to make forty shops bearable, few enough to be a
 * guest on someone else's server. */
const READ_AT_ONCE = 3;

const PLACEHOLDER = `rolexpassion.com
watchesofswitzerland.com
https://someshop.com/collections/watches

# or paste a CSV with a header:
# domain,shop name,contact email`;

export function AddShops({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<false | 'reading' | 'adding'>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const stop = useRef(false);

  const parsed = useMemo(() => parseShops(text), [text]);

  async function readSites() {
    const start: Row[] = parsed.shops.map((shop) => ({
      domain: shop.domain,
      line: shop.line,
      fromFileName: shop.name,
      fromFileEmail: shop.email,
      state: 'waiting',
      include: false,
    }));

    setRows(start);
    setNotice(null);
    setBusy('reading');
    stop.current = false;

    const next = [...start];
    const update = (index: number, patch: Partial<Row>) => {
      next[index] = { ...next[index], ...patch };
      setRows([...next]);
    };

    // A fixed pool rather than Promise.all: forty sites at once is rude to them
    // and hides which one is slow.
    let cursor = 0;
    const worker = async () => {
      while (cursor < next.length && !stop.current) {
        const index = cursor++;
        update(index, { state: 'reading' });

        try {
          const found = await discoverShop(next[index].domain);
          update(index, {
            state: 'found',
            found,
            // A site with no sitemap and no recognised platform is a guess at
            // best, so it is listed but not ticked.
            include: found.sawSitemap || found.platform !== 'generic',
          });
        } catch (caught) {
          const failure = caught as Error & { status?: number };
          if (failure.status === 429) {
            stop.current = true;
            setNotice(failure.message);
            update(index, { state: 'waiting' });
            return;
          }
          update(index, { state: 'unreadable', error: failure.message });
        }
      }
    };

    await Promise.all(Array.from({ length: READ_AT_ONCE }, worker));
    setBusy(false);
  }

  async function addShops() {
    if (!rows) return;
    const wanted = rows.filter((row) => row.include && row.state === 'found');
    if (!wanted.length) return;

    if (!confirmWrite(`Add ${wanted.length} shop(s) and read their catalogues?`)) return;

    setNotice(null);
    setBusy('adding');
    stop.current = false;

    const next = [...rows];
    const update = (domain: string, patch: Partial<Row>) => {
      const index = next.findIndex((row) => row.domain === domain);
      if (index === -1) return;
      next[index] = { ...next[index], ...patch };
      setRows([...next]);
    };

    // One at a time. These are writes, and a catalogue read of five hundred
    // products is not something to run three of at once.
    for (const row of wanted) {
      if (stop.current) break;
      update(row.domain, { state: 'adding' });

      try {
        const added = await syncCatalog({
          sourceUrl: row.found!.catalogUrl,
          dealerName: row.fromFileName ?? row.found!.name,
          dealerEmail: row.fromFileEmail ?? row.found!.email ?? undefined,
        });
        update(row.domain, { state: 'added', added });
      } catch (caught) {
        const failure = caught as Error & { status?: number };
        if (failure.status === 429) {
          stop.current = true;
          setNotice(
            `${failure.message} Shops already added are done — paste the same list later and they will be skipped.`
          );
          update(row.domain, { state: 'found' });
          break;
        }
        update(row.domain, { state: 'failed', error: failure.message });
      }
    }

    setBusy(false);
    onAdded();
  }

  const readable = rows?.filter((row) => row.state === 'found') ?? [];
  const chosen = readable.filter((row) => row.include);
  const done = rows?.filter((row) => row.state === 'added') ?? [];

  return (
    <section>
      <header className="bar">
        <h1>Add shops</h1>
      </header>

      <div className="panel">
        <label>
          Domains, one per line — or a CSV
          <textarea
            rows={8}
            value={text}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            disabled={busy !== false}
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        <div className="bar">
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            disabled={busy !== false}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setText(await file.text());
              // Otherwise choosing the same file twice in a row does nothing.
              event.target.value = '';
            }}
          />

          <button
            className="push"
            disabled={busy !== false || parsed.shops.length === 0}
            onClick={() => void readSites()}>
            {busy === 'reading' ? 'Reading…' : `Read ${parsed.shops.length || ''} site(s)`}
          </button>

          {busy !== false ? (
            <button className="ghost" onClick={() => (stop.current = true)}>
              Stop
            </button>
          ) : null}
        </div>

        <p className="muted small">
          {parsed.shops.length} shop{parsed.shops.length === 1 ? '' : 's'}
          {parsed.duplicates > 0 ? `, ${parsed.duplicates} repeated line(s) ignored` : ''}
          {parsed.rejected.length > 0 ? `, ${parsed.rejected.length} line(s) unreadable` : ''}.
          Reading a site writes nothing.
        </p>

        {parsed.rejected.length > 0 ? <Unreadable lines={parsed.rejected} /> : null}
      </div>

      {notice ? <p className="error">{notice}</p> : null}

      {rows && rows.length > 0 ? (
        <>
          <table>
            <thead>
              <tr>
                <th className="tick">
                  <input
                    type="checkbox"
                    checked={readable.length > 0 && chosen.length === readable.length}
                    disabled={busy !== false || readable.length === 0}
                    onChange={(event) =>
                      setRows(
                        rows.map((row) =>
                          row.state === 'found' ? { ...row, include: event.target.checked } : row
                        )
                      )
                    }
                  />
                </th>
                <th>Shop</th>
                <th className="num">Products</th>
                <th>Platform</th>
                <th>Contact</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ShopRow
                  key={row.domain}
                  row={row}
                  locked={busy !== false}
                  onToggle={(include) =>
                    setRows(rows.map((it) => (it.domain === row.domain ? { ...it, include } : it)))
                  }
                />
              ))}
            </tbody>
          </table>

          <div className="bar spaced">
            <button
              disabled={busy !== false || chosen.length === 0}
              onClick={() => void addShops()}>
              {busy === 'adding' ? 'Adding…' : `Add ${chosen.length} shop(s)`}
            </button>
            <span className="muted small">
              Creates each shop unpublished and reads its catalogue. No watches are
              imported and nothing reaches a buyer yet.
            </span>
          </div>

          {done.length > 0 ? (
            <p className="muted small legend">
              {done.length} shop{done.length === 1 ? '' : 's'} added, holding{' '}
              {done.reduce((sum, row) => sum + (row.added?.found ?? 0), 0)} watches between them.
              They are on <strong>Dealers</strong>, unpublished — import watches there, then
              publish.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Unreadable({ lines }: { lines: Rejection[] }) {
  return (
    <details className="problems">
      <summary>{lines.length} line(s) with no domain in them</summary>
      <ul className="rows tight">
        {lines.map((line) => (
          <li key={line.line}>
            <span className="muted small">line {line.line}</span> <code>{line.text}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

const STATE_LABEL: Record<RowState, string> = {
  waiting: 'waiting',
  reading: 'reading…',
  found: '',
  unreadable: 'could not read',
  adding: 'adding…',
  added: 'added',
  failed: 'failed',
};

function ShopRow({
  row,
  locked,
  onToggle,
}: {
  row: Row;
  locked: boolean;
  onToggle: (include: boolean) => void;
}) {
  const found = row.found;
  const email = row.fromFileEmail ?? found?.email;

  return (
    <tr className={row.state === 'unreadable' || row.state === 'failed' ? 'dim' : undefined}>
      <td className="tick">
        <input
          type="checkbox"
          checked={row.include}
          disabled={locked || row.state !== 'found'}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </td>

      <td>
        <strong>{row.fromFileName ?? found?.name ?? row.domain}</strong>
        <br />
        <span className="muted small">{row.domain}</span>
      </td>

      <td className="num">
        {found ? (
          found.productCount || <span className="muted">?</span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>

      <td>
        {found ? (
          <>
            <span className={found.platform === 'generic' ? 'badge wait' : 'badge'}>
              {found.platform}
            </span>
            {!found.sawSitemap ? <span className="badge wait">no sitemap</span> : null}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>

      <td>
        {email ? (
          <span className="small">{email}</span>
        ) : found ? (
          // send-inquiry has nowhere to send without one, so a buyer's question
          // would fail rather than go unanswered.
          <span className="badge wait">none found</span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>

      <td>
        {row.state === 'added' && row.added ? (
          <span className="badge ok">
            {row.added.found} watches
            {row.added.complete ? '' : ' (more to read)'}
          </span>
        ) : row.error ? (
          <span className="error small">{row.error}</span>
        ) : (
          <span className="muted small">{STATE_LABEL[row.state]}</span>
        )}
      </td>
    </tr>
  );
}
