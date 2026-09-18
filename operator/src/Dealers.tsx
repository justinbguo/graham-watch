import { useEffect, useState } from 'react';

import { importListings, queueForImport, syncCatalog, type PublishTotals } from './importer';
import { ShopListings } from './ShopListings';
import { confirmWrite, supabase, type OperatorDealer, type Permission } from './supabase';

type Row = OperatorDealer;

const NEXT: Record<Permission, Permission> = {
  pending: 'approved',
  approved: 'revoked',
  revoked: 'approved',
};

/** What one click imports, when the operator does not say otherwise. */
const DEFAULT_IMPORT = 10;

export function Dealers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const reload = () => setTick((value) => value + 1);

  useEffect(() => {
    let live = true;
    void (async () => {
      // An RPC, not a table read: contact_email is not granted to authenticated
      // and a pending shop's listings are not readable, so both would be missing
      // from anything PostgREST could return here. See 20260915000005.
      const { data, error: failed } = await supabase.rpc('operator_dealers');

      if (!live) return;
      setError(failed?.message ?? null);
      setRows(data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  async function run(dealer: Row, work: () => Promise<string>) {
    setBusyId(dealer.id);
    setError(null);
    setProgress(null);
    try {
      setProgress(await work());
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusyId(null);
    }
  }

  function setPermission(dealer: Row, permission: Permission) {
    const asked =
      permission === 'approved'
        ? `Put ${dealer.name}'s ${dealer.listings_held} imported watch(es) in front of buyers?`
        : `Pull ${dealer.name} out of the deck? Buyers stop seeing their watches.`;
    if (!confirmWrite(asked)) return;

    void run(dealer, async () => {
      const { error: failed } = await supabase.rpc('set_dealer_permission', {
        p_dealer_id: dealer.id,
        p_permission: permission,
      });
      if (failed) throw failed;
      return `${dealer.name} → ${permission}`;
    });
  }

  /**
   * Turns catalogue rows into watches.
   *
   * The only action here that spends money — a model call and a photo download
   * per watch — so the count is typed rather than defaulted, and anything left
   * queued from an interrupted run is drained first.
   */
  function importSome(dealer: Row) {
    const waiting = dealer.catalog_queued;
    const available = Number(dealer.catalog_total) - Number(dealer.listings_held);

    const answer = window.prompt(
      [
        `How many of ${dealer.name}'s watches should be imported?`,
        '',
        `Catalogue holds ${dealer.catalog_total}, already imported ${dealer.listings_held}.`,
        waiting > 0 ? `${waiting} are queued from an earlier run and go first.` : '',
        '',
        'Each one costs a model call and downloads its photos.',
      ]
        .filter(Boolean)
        .join('\n'),
      String(Math.min(DEFAULT_IMPORT, Math.max(available, 0)) || DEFAULT_IMPORT)
    );
    if (answer === null) return;

    const count = Number(answer);
    if (!Number.isInteger(count) || count < 0) {
      setError('That is not a whole number.');
      return;
    }
    if (count === 0 && waiting === 0) return;
    if (!confirmWrite(`Import ${count} watch(es) from ${dealer.name}?`)) return;

    void run(dealer, async () => {
      const queued = await queueForImport(dealer.id, count);
      const totals = await importListings(dealer.id, (at) =>
        setProgress(`${dealer.name}: ${at.published} imported, ${at.pending} to go…`)
      );
      return summarise(dealer.name, queued + waiting, totals);
    });
  }

  /** Re-reads the shop's catalogue. Costs HTTP; imports nothing. */
  function refresh(dealer: Row) {
    if (!dealer.website) {
      setError(`${dealer.name} has no website to read.`);
      return;
    }
    void run(dealer, async () => {
      const result = await syncCatalog({ sourceUrl: dealer.website!, dealerId: dealer.id });
      return `${dealer.name}: ${result.found} in the catalogue, ${result.added} new, ${result.retired} gone.`;
    });
  }

  const needle = query.trim().toLowerCase();
  const shown = (rows ?? []).filter(
    (dealer) =>
      !needle ||
      dealer.name.toLowerCase().includes(needle) ||
      (dealer.website ?? '').toLowerCase().includes(needle)
  );

  return (
    <section>
      <header className="bar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name or website"
        />
        <button className="ghost push" onClick={reload}>
          Reload
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {progress ? <p className="muted small">{progress}</p> : null}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          No shops yet. Add some on <strong>Add shops</strong>.
        </p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th />
                <th>Shop</th>
                <th className="num">In the deck</th>
                <th className="num">Imported</th>
                <th className="num">Catalogue</th>
                <th>Contact</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((dealer) => {
                const next = NEXT[dealer.permission];
                const expanded = open === dealer.id;
                const held = Number(dealer.listings_held);
                const inDeck = Number(dealer.listings_in_deck);

                return [
                  <tr key={dealer.id} className={expanded ? 'open' : undefined}>
                    <td className="tick">
                      <button
                        className="arrow"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Hide watches' : 'Show watches'}
                        onClick={() => setOpen(expanded ? null : dealer.id)}>
                        {expanded ? '▾' : '▸'}
                      </button>
                    </td>

                    <td>
                      <strong>{dealer.name}</strong>
                      <br />
                      {dealer.website ? (
                        <a
                          className="muted small"
                          href={dealer.website}
                          target="_blank"
                          rel="noreferrer">
                          {dealer.website}
                        </a>
                      ) : (
                        <span className="muted small">no website</span>
                      )}
                    </td>

                    <td className="num">
                      <strong>{inDeck}</strong>
                      {inDeck < held ? (
                        <>
                          <br />
                          <span className="muted small">{held - inDeck} not showing</span>
                        </>
                      ) : null}
                    </td>

                    <td className="num">{held}</td>

                    <td className="num">
                      {dealer.catalog_total}
                      {dealer.catalog_queued > 0 ? (
                        <>
                          <br />
                          <span className="muted small">{dealer.catalog_queued} queued</span>
                        </>
                      ) : null}
                      {dealer.catalog_failed > 0 ? (
                        <>
                          <br />
                          <span className="muted small">{dealer.catalog_failed} failed</span>
                        </>
                      ) : null}
                    </td>

                    <td>
                      {dealer.contact_email ? (
                        <span className="small">{dealer.contact_email}</span>
                      ) : (
                        // send-inquiry has nowhere to send without this, so a
                        // buyer's question would fail rather than go unanswered.
                        <span className="badge wait">no address — inquiries fail</span>
                      )}
                    </td>

                    <td>
                      <span
                        className={`badge ${dealer.permission === 'approved' ? 'ok' : 'wait'}`}>
                        {dealer.permission}
                      </span>
                      {dealer.claimed_by ? <span className="badge">claimed</span> : null}
                    </td>

                    <td className="actions">
                      <button
                        className="ghost"
                        disabled={busyId !== null || !dealer.can_import}
                        title={
                          dealer.can_import
                            ? 'Read the catalogue again'
                            : 'The dealer manages this shop themselves'
                        }
                        onClick={() => refresh(dealer)}>
                        Refresh
                      </button>
                      <button
                        className="ghost"
                        disabled={busyId !== null || !dealer.can_import}
                        title={
                          dealer.can_import
                            ? 'Turn catalogue items into watches'
                            : 'The dealer manages this shop themselves'
                        }
                        onClick={() => importSome(dealer)}>
                        Import
                      </button>
                      <button
                        className={next === 'approved' ? '' : 'ghost'}
                        disabled={busyId !== null}
                        onClick={() => setPermission(dealer, next)}>
                        {next === 'approved' ? 'Publish' : 'Pull back'}
                      </button>
                    </td>
                  </tr>,

                  expanded ? (
                    <tr key={`${dealer.id}-detail`} className="detail-row">
                      <td colSpan={8}>
                        <ShopListings dealerId={dealer.id} reload={tick} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>

          <p className="muted small legend">
            <strong>In the deck</strong> is what a buyer can see right now: the watch is
            active, unsold, and the shop is approved. <strong>Imported</strong> is every
            watch we hold for them. <strong>Catalogue</strong> is what their site is
            offering, which is what <em>Import</em> draws from. A gap between the first
            two means some are sold or hidden — or that the shop is not approved, in
            which case none of them show and <em>Publish</em> is what changes that.
          </p>
        </>
      )}
    </section>
  );
}

function summarise(name: string, asked: number, totals: PublishTotals): string {
  const parts = [`${totals.published} imported`];
  if (totals.skipped) parts.push(`${totals.skipped} skipped`);
  if (totals.failed) parts.push(`${totals.failed} failed`);
  if (totals.pending) parts.push(`${totals.pending} still queued`);

  return asked === 0 && totals.processed === 0
    ? `${name} had nothing left to import.`
    : `${name}: ${parts.join(', ')}.`;
}
