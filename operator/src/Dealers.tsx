import { useEffect, useRef, useState } from 'react';

import { ImportPreview } from './ImportPreview';
import {
  importListings,
  stageImport,
  syncCatalog,
  type ImportCandidate,
  type PublishTotals,
} from './importer';
import { ShopPage, type Profile } from './ShopPage';
import { STEP_LABEL, countsLine, stageOf, type Step } from './stage';
import { confirmWrite, supabase, type OperatorDealer, type Permission } from './supabase';

type Row = OperatorDealer;

/** Shops a run on Add shops just created, and what each read found for sale. */
export type JustAdded = { id: string; forSale: number }[];

/** The shop whose catalogue is open, and what the read that opened it found. */
type Picking = { dealer: Row; note: string | null };

export function Dealers({
  justAdded,
  onClearJustAdded,
}: {
  justAdded: JustAdded | null;
  onClearJustAdded: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const reload = () => setTick((value) => value + 1);
  // Read once: App mounts this screen fresh when a run on Add shops hands over.
  const handoff = useRef(justAdded);

  useEffect(() => {
    let live = true;
    void (async () => {
      // An RPC, not a table read: contact_email is not granted to authenticated
      // and a pending shop's listings are not readable, so both would be missing
      // from anything PostgREST could return here. See 20260915000005.
      //
      // The scraped profile comes alongside in one read for every shop, rather
      // than a read per shop when one is opened. It is three short columns.
      const [{ data, error: failed }, shops] = await Promise.all([
        supabase.rpc('operator_dealers'),
        supabase.from('dealers').select('id, description, instagram, logo_url'),
      ]);

      if (!live) return;
      setError(failed?.message ?? shops.error?.message ?? null);
      setRows(data ?? []);

      // One shop just added: go straight to choosing its watches. Several:
      // the list narrows to them, and each row's button is that same step.
      const added = handoff.current?.length === 1 ? handoff.current[0] : null;
      handoff.current = null;
      if (added) {
        const dealer = data?.find((row) => row.id === added.id);
        if (dealer) {
          setSelected(dealer.id);
          setPicking({
            dealer,
            note: `Just added, unpublished. ${added.forSale} for sale on their site.`,
          });
        }
        onClearJustAdded();
      }
      setProfiles(
        Object.fromEntries(
          (shops.data ?? []).map(({ id, description, instagram, logo_url }) => [
            id,
            { description, instagram, logo_url },
          ])
        )
      );
    })();
    return () => {
      live = false;
    };
    // onClearJustAdded is a stable callback from App, so this still runs once per reload.
  }, [tick, onClearJustAdded]);

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
      return permission === 'approved'
        ? `${dealer.name} is live.`
        : `${dealer.name} is out of the deck.`;
    });
  }

  function step(dealer: Row, next: Step) {
    if (next === 'pick') setPicking({ dealer, note: null });
    else setPermission(dealer, next === 'publish' ? 'approved' : 'revoked');
  }

  /**
   * The one action that spends money: a model call and a photo download per
   * watch. Everything before it — reading the shop, ticking rows, editing a
   * title — is free and reversible, which is why the spend is confirmed here
   * and nowhere earlier.
   */
  function importSome(dealer: Row, candidates: ImportCandidate[]) {
    const count = candidates.filter((candidate) => candidate.selected).length;
    if (!dealer.website) {
      setError(`${dealer.name} has no website, so stock cannot be verified before import.`);
      return;
    }
    if (!confirmWrite(`Import ${count} watch(es) from ${dealer.name}?`)) return;
    setPicking(null);
    void run(dealer, async () => {
      setProgress(`${dealer.name}: checking the shop for sold watches…`);
      await syncCatalog({ sourceUrl: dealer.website!, dealerId: dealer.id });
      const queued = await stageImport(dealer.id, candidates);
      const totals = await importListings(dealer.id, (at) =>
        setProgress(`${dealer.name}: ${at.published} imported, ${at.pending} to go…`)
      );
      const result = summarise(dealer.name, queued, totals);
      const sold = count - queued;
      return sold > 0 ? `${sold} selected watch(es) were no longer for sale. ${result}` : result;
    });
  }

  /**
   * Re-reads the shop's site, then shows what they have. Costs HTTP and
   * imports nothing.
   *
   * The read and the picker are one action because a refresh that only printed
   * "3 new" left the operator with a number and no way to act on it.
   */
  function refresh(dealer: Row) {
    if (!dealer.website) {
      setError(`${dealer.name} has no website to read.`);
      return;
    }
    void run(dealer, async () => {
      const result = await syncCatalog({ sourceUrl: dealer.website!, dealerId: dealer.id });
      setPicking({
        dealer,
        note: `Just read their site: ${result.forSale} for sale, ${result.added} we had not seen before, ${result.retired} gone.`,
      });
      return `${dealer.name}: ${result.forSale} for sale, ${result.added} new, ${result.retired} gone.`;
    });
  }

  const current = selected ? rows?.find((row) => row.id === selected) : undefined;

  const narrowed = justAdded && justAdded.length > 1 ? new Set(justAdded.map((one) => one.id)) : null;
  const needle = query.trim().toLowerCase();
  const shown = (rows ?? []).filter(
    (dealer) =>
      (!narrowed || narrowed.has(dealer.id)) &&
      (!needle ||
        dealer.name.toLowerCase().includes(needle) ||
        (dealer.website ?? '').toLowerCase().includes(needle))
  );

  const status = (
    <>
      {error ? <p className="error">{error}</p> : null}
      {progress ? <p className="muted small">{progress}</p> : null}
    </>
  );

  const picker = picking ? (
    <ImportPreview
      dealerId={picking.dealer.id}
      dealerName={picking.dealer.name}
      note={picking.note}
      onClose={() => setPicking(null)}
      onImport={(candidates) => importSome(picking.dealer, candidates)}
    />
  ) : null;

  if (current) {
    return (
      <>
        {status}
        <ShopPage
          dealer={current}
          profile={profiles[current.id]}
          busy={busyId !== null}
          reload={tick}
          onBack={() => setSelected(null)}
          onStep={(next) => step(current, next)}
          onRefresh={() => refresh(current)}
          onChanged={reload}
        />
        {picker}
      </>
    );
  }

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

      {narrowed ? (
        <div className="bar notice">
          <span className="small">
            {narrowed.size} shops just added, unpublished. Pick watches for each, then publish.
          </span>
          <button className="ghost push" onClick={onClearJustAdded}>
            Show all shops
          </button>
        </div>
      ) : null}

      {status}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          No shops yet. Add some on <strong>Add shops</strong>.
        </p>
      ) : (
        <table className="shops">
          <tbody>
            {shown.map((dealer) => {
              const stage = stageOf(dealer);
              const profile = profiles[dealer.id];
              const busy = busyId !== null;

              return (
                <tr key={dealer.id}>
                  <td>
                    <div className="shopcell">
                      {profile?.logo_url ? (
                        <img className="shopmark small" src={profile.logo_url} alt="" loading="lazy" />
                      ) : (
                        <span className="shopmark small" />
                      )}
                      <div className="grow">
                        <button className="shop-name" onClick={() => setSelected(dealer.id)}>
                          {dealer.name}
                        </button>
                        <span className="muted small">
                          {countsLine(dealer)}
                          {dealer.catalog_failed > 0 ? ` · ${dealer.catalog_failed} failed` : ''}
                        </span>
                        {/* send-inquiry has nowhere to send without one, so a
                            buyer's question fails rather than goes unanswered. */}
                        {dealer.contact_email ? null : (
                          <span className="badge wait">no address — inquiries fail</span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="stage-cell">
                    <span className={`badge stage ${stage.tone}`}>{stage.label}</span>
                  </td>

                  <td className="actions">
                    {stage.quiet ? (
                      <button className="ghost" disabled={busy} onClick={() => step(dealer, stage.quiet!)}>
                        {STEP_LABEL[stage.quiet]}
                      </button>
                    ) : null}
                    {stage.primary ? (
                      <button disabled={busy} onClick={() => step(dealer, stage.primary!)}>
                        {STEP_LABEL[stage.primary]}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {picker}
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
