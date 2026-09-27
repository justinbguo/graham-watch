import { useEffect, useState } from 'react';

import { ImportPreview } from './ImportPreview';
import {
  importListings,
  stageImport,
  syncCatalog,
  type ImportCandidate,
  type PublishTotals,
} from './importer';
import { ShopListings } from './ShopListings';
import { confirmWrite, supabase, type OperatorDealer, type Permission } from './supabase';

type Row = OperatorDealer;

/**
 * What the scrape read off the shop's own site. It comes from a plain table
 * read rather than `operator_dealers`, because these three columns are granted
 * to every signed-in reader while the RPC exists for the ones that are not.
 */
type Profile = { description: string | null; instagram: string | null; logo_url: string | null };

const NEXT: Record<Permission, Permission> = {
  pending: 'approved',
  approved: 'revoked',
  revoked: 'approved',
};

/** The shop whose catalogue is open, and what the read that opened it found. */
type Picking = { dealer: Row; note: string | null };

export function Dealers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const reload = () => setTick((value) => value + 1);

  useEffect(() => {
    let live = true;
    void (async () => {
      // An RPC, not a table read: contact_email is not granted to authenticated
      // and a pending shop's listings are not readable, so both would be missing
      // from anything PostgREST could return here. See 20260915000005.
      //
      // The scraped profile comes alongside in one read for every shop, rather
      // than a read per shop when a row is opened. It is three short columns,
      // and they are columns on this table now.
      const [{ data, error: failed }, shops] = await Promise.all([
        supabase.rpc('operator_dealers'),
        supabase.from('dealers').select('id, description, instagram, logo_url'),
      ]);

      if (!live) return;
      setError(failed?.message ?? shops.error?.message ?? null);
      setRows(data ?? []);
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
   * "3 new" left the operator with a number and no way to act on it. What a
   * refresh is for is the stock that appeared since the last one, so it ends
   * on the screen where those can be chosen.
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
      return `${dealer.name}: ${result.found} in the catalogue, ${result.forSale} for sale, ${result.added} new, ${result.retired} gone.`;
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
          {/* Nine columns fit a laptop; a narrow window or a zoomed page does
              not. The table scrolls sideways inside the page rather than
              pushing the page itself wider, which would take the header's
              controls off screen with it. */}
          <div className="scroller">
          <table>
            <thead>
              <tr>
                <th className="tick" />
                <th>Shop</th>
                <th className="num">In the deck</th>
                <th className="num">Imported</th>
                <th className="num">Catalogue</th>
                <th>Description</th>
                <th>Instagram</th>
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
                const profile = profiles[dealer.id];

                return [
                  <tr key={dealer.id} className={expanded ? 'open' : undefined}>
                    <td className="tick">
                      <button
                        className="arrow"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Hide watches' : 'Show watches'}
                        onClick={() => setOpen(expanded ? null : dealer.id)}>
                        <Chevron />
                      </button>
                    </td>

                    <td>
                      <div className="shopcell">
                        {/* The mark the scrape found, beside the name it belongs
                            to. It used to appear only once a row was opened,
                            which is the one place you already knew the shop. */}
                        {profile?.logo_url ? (
                          <img className="shopmark small" src={profile.logo_url} alt="" loading="lazy" />
                        ) : null}
                        <div className="grow">
                          <strong>{dealer.name}</strong>
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
                          {/* Where the shop is reached, under the name it
                              belongs to rather than in a column of its own: an
                              address is identity, and 250px of email was the
                              column that pushed the table off the window.
                              send-inquiry has nowhere to send without it, so a
                              buyer's question fails rather than goes
                              unanswered — hence the badge, not a dash. */}
                          {dealer.contact_email ? (
                            <span className="muted small">{dealer.contact_email}</span>
                          ) : (
                            <span className="badge wait">no address — inquiries fail</span>
                          )}
                        </div>
                      </div>
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

                    {/* Both read off the shop's own site by the scrape, and
                        both are what a buyer sees on the dealer's page. They
                        are columns because the only way to know the read worked
                        is to look, and a column can be scanned down a list of
                        forty shops. */}
                    <td className="small prose">
                      {profile?.description ? (
                        <span title={profile.description}>{profile.description}</span>
                      ) : (
                        <span className="muted">not read yet</span>
                      )}
                    </td>

                    <td className="small">
                      {profile?.instagram ? (
                        <a
                          href={`https://instagram.com/${profile.instagram}`}
                          target="_blank"
                          rel="noreferrer">
                          @{profile.instagram}
                        </a>
                      ) : (
                        <span className="muted">—</span>
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
                            ? "Read the shop's site again, then show what they have"
                            : 'The dealer manages this shop themselves'
                        }
                        onClick={() => refresh(dealer)}>
                        Refresh from site
                      </button>
                      <button
                        className="ghost"
                        disabled={busyId !== null || !dealer.can_import}
                        title={
                          dealer.can_import
                            ? 'Choose watches from the catalogue we already hold'
                            : 'The dealer manages this shop themselves'
                        }
                        onClick={() => setPicking({ dealer, note: null })}>
                        Add watches
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
                      <td colSpan={9}>
                        <ShopListings dealerId={dealer.id} reload={tick} onChanged={reload} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
          </div>

          <p className="muted small legend">
            <strong>In the deck</strong> is what a buyer can see right now: the watch is
            active, unsold, and the shop is approved. <strong>Imported</strong> is every
            watch we hold for them. <strong>Catalogue</strong> is what their site is
            offering. A gap between the first two means some are sold or hidden — or
            that the shop is not approved, in which case none of them show.
          </p>

          <p className="muted small legend">
            The three actions do different jobs. <strong>Refresh from site</strong> reads
            their site again for stock we have not seen and then shows it — free, and it
            imports nothing on its own. <strong>Add watches</strong> opens the same list
            without re-reading, so you can pick from the catalogue we already hold;
            importing is the only step that spends a model call per watch.{' '}
            <strong>Publish</strong> and <strong>Pull back</strong> decide whether buyers
            see the watches we have already imported.
          </p>
        </>
      )}

      {picking ? (
        <ImportPreview
          dealerId={picking.dealer.id}
          dealerName={picking.dealer.name}
          note={picking.note}
          onClose={() => setPicking(null)}
          onImport={(candidates) => importSome(picking.dealer, candidates)}
        />
      ) : null}
    </section>
  );
}

/**
 * `chevron-right` from Material Community Icons, the set the app draws from,
 * as a path rather than a font: the console loads no icon font, and a typed
 * triangle (▸) is a character whose size and weight come from whatever the
 * system decided. CSS turns it a quarter when the row is open.
 */
function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.59 16.58 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42Z" />
    </svg>
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
