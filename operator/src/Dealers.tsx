import { useEffect, useState } from 'react';

import {
  shopErrors,
  visibleDealers,
  type FlagFilter,
  type ShopStatus,
  type SortKey,
} from './dealerTable';
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
  const [statusFilter, setStatusFilter] = useState<'all' | ShopStatus>('all');
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [codes, setCodes] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
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
    const asked = permissionQuestion(dealer, permission);
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

  function issueCode(dealer: Row) {
    if (dealer.claimed_by) {
      setError(`Unassign ${dealer.name} before issuing a claim code.`);
      return;
    }
    if (!confirmWrite(`Issue a claim code for ${dealer.name}? Anyone with the code can claim the shop for 7 days.`)) {
      return;
    }
    void run(dealer, async () => {
      const { data, error: failed } = await supabase.rpc('operator_issue_claim_code', {
        p_dealer_id: dealer.id,
      });
      if (failed) throw failed;
      const issued = data?.[0];
      if (!issued) throw new Error('No code came back.');
      setCodes((current) => ({
        ...current,
        [dealer.id]: { code: issued.code, expiresAt: issued.expires_at },
      }));
      return `${dealer.name}: claim code ${issued.code}`;
    });
  }

  function revokeCode(dealer: Row) {
    if (!confirmWrite(`Revoke the live claim code for ${dealer.name}?`)) return;
    void run(dealer, async () => {
      const { error: failed } = await supabase.rpc('operator_revoke_claim_code', {
        p_dealer_id: dealer.id,
      });
      if (failed) throw failed;
      setCodes((current) => {
        const next = { ...current };
        delete next[dealer.id];
        return next;
      });
      return `${dealer.name}: claim code revoked`;
    });
  }

  function unassign(dealer: Row) {
    const who = dealer.claimer_name || (dealer.claimer_handle ? `@${dealer.claimer_handle}` : 'the dealer');
    if (
      !confirmWrite(
        `Unassign ${who} from ${dealer.name}? They lose the shop, and any live claim code is burned.`,
      )
    ) {
      return;
    }
    void run(dealer, async () => {
      const { error: failed } = await supabase.rpc('operator_unclaim_shop', { p_dealer_id: dealer.id });
      if (failed) throw failed;
      setCodes((current) => {
        const next = { ...current };
        delete next[dealer.id];
        return next;
      });
      return `${dealer.name} is unclaimed`;
    });
  }

  async function copyCode(dealerId: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(dealerId);
    } catch {
      setError('Could not copy. Select the code and copy it yourself.');
    }
  }

  const shown = visibleDealers(rows ?? [], query, statusFilter, flagFilter, sort);

  return (
    <section>
      <header className="bar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name or website"
        />
        <select
          aria-label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | ShopStatus)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Published</option>
          <option value="paused">Paused</option>
          <option value="revoked">Revoked</option>
        </select>
        <select
          aria-label="Flags"
          value={flagFilter}
          onChange={(event) => setFlagFilter(event.target.value as FlagFilter)}>
          <option value="all">All flags</option>
          <option value="neglected">Neglected</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="quiet">Quiet 14 days</option>
          <option value="unanswered">Unanswered 48 hours</option>
          <option value="missing_photos">Missing photos</option>
          <option value="last_error">Last error</option>
        </select>
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
                <SortHeader label="Shop" sortKey="name" sort={sort} onSort={setSort} />
                <th className="num">In the deck</th>
                <SortHeader label="Imported" sortKey="listings" sort={sort} onSort={setSort} numeric />
                <th className="num">Catalogue</th>
                <th>
                  <button
                    className="sort"
                    aria-pressed={sort === 'last_error'}
                    onClick={() => setSort(sort === 'last_error' ? 'newest' : 'last_error')}>
                    Last refresh{sort === 'last_error' ? ' ·' : ''}
                  </button>
                  <button
                    className="sort"
                    aria-pressed={sort === 'missing_photos'}
                    onClick={() => setSort(sort === 'missing_photos' ? 'newest' : 'missing_photos')}>
                    Photos{sort === 'missing_photos' ? ' ·' : ''}
                  </button>
                </th>
                <th>Description</th>
                <th>Instagram</th>
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={setSort} />
                <SortHeader label="Flags" sortKey="flags" sort={sort} onSort={setSort} />
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((dealer) => {
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
                          <ClaimLine
                            dealer={dealer}
                            code={codes[dealer.id] ?? null}
                            copied={copied === dealer.id}
                            busy={busyId !== null}
                            onIssue={() => issueCode(dealer)}
                            onRevoke={() => revokeCode(dealer)}
                            onUnassign={() => unassign(dealer)}
                            onCopy={(code) => void copyCode(dealer.id, code)}
                          />
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

                    <td className="small">
                      <RefreshStatus dealer={dealer} />
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
                        className={`badge ${dealer.permission === 'approved' ? 'ok' : dealer.permission === 'paused' ? 'wait' : 'wait'}`}>
                        {dealer.permission}
                      </span>
                    </td>

                    <td>
                      {(dealer.neglect_flags ?? []).length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        (dealer.neglect_flags ?? []).map((flag) => (
                          <span key={flag} className="badge wait">
                            {flag === 'quiet' ? 'quiet 14d' : flag === 'unanswered' ? 'unanswered 48h' : flag}
                          </span>
                        ))
                      )}
                      {dealer.unanswered_count > 0 ? (
                        <>
                          <br />
                          <span className="muted small">{dealer.unanswered_count} waiting</span>
                        </>
                      ) : null}
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
                      <ShopPermission dealer={dealer} busy={busyId !== null} onSet={setPermission} />
                    </td>
                  </tr>,

                  expanded ? (
                    <tr key={`${dealer.id}-detail`} className="detail-row">
                      <td colSpan={11}>
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
            offering. <strong>Last refresh</strong> is the nightly job: when it last
            finished, how many listings it published and skipped, and the last error
            in the cell.
            Photos are the live gallery on active, unsold watches. A gap between the
            first two counts means some are sold or hidden — or that the shop is not
            approved, in which case none of them show.
          </p>

          <p className="muted small legend">
            <strong>Refresh from site</strong> reads their site again and then shows
            what they have — free, and it imports nothing on its own.{' '}
            <strong>Add watches</strong> opens that list without re-reading; importing
            is the only step that spends a model call per watch. <strong>Publish</strong>{' '}
            puts the watches in the deck. <strong>Pause</strong> takes a published shop
            out of the deck and out of the nightly refresh until <strong>Resume</strong>.{' '}
            <strong>Pull back</strong> revokes the shop. That is a separate decision
            from pause, and publishing again is how a revoked shop comes back.
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

function permissionQuestion(dealer: Row, permission: Permission): string {
  if (permission === 'paused') {
    return `Pause ${dealer.name}? Buyers stop seeing their watches, and the nightly refresh skips them, until you resume.`;
  }
  if (permission === 'revoked') {
    return `Revoke ${dealer.name}? Buyers stop seeing their watches. Publishing them again is a separate decision from resume.`;
  }
  if (dealer.permission === 'paused') {
    return `Resume ${dealer.name}? Their ${dealer.listings_held} imported watch(es) go back in front of buyers, and the nightly refresh includes them again.`;
  }
  return `Put ${dealer.name}'s ${dealer.listings_held} imported watch(es) in front of buyers?`;
}

function ShopPermission({
  dealer,
  busy,
  onSet,
}: {
  dealer: Row;
  busy: boolean;
  onSet: (dealer: Row, permission: Permission) => void;
}) {
  if (dealer.permission === 'approved') {
    return (
      <>
        <button className="ghost" disabled={busy} onClick={() => onSet(dealer, 'paused')}>
          Pause
        </button>
        <button className="ghost" disabled={busy} onClick={() => onSet(dealer, 'revoked')}>
          Pull back
        </button>
      </>
    );
  }

  if (dealer.permission === 'paused') {
    return (
      <>
        <button disabled={busy} onClick={() => onSet(dealer, 'approved')}>
          Resume
        </button>
        <button className="ghost" disabled={busy} onClick={() => onSet(dealer, 'revoked')}>
          Pull back
        </button>
      </>
    );
  }

  return (
    <button disabled={busy} onClick={() => onSet(dealer, 'approved')}>
      Publish
    </button>
  );
}

function newer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function RefreshStatus({ dealer }: { dealer: Row }) {
  const nightly = dealer.last_refresh_at;
  const sync = dealer.last_synced_at;
  const when = newer(nightly, sync);
  const syncIsNewer = Boolean(sync && nightly && new Date(sync).getTime() > new Date(nightly).getTime());
  const errors = shopErrors(dealer);

  if (!when && errors.length === 0) {
    return <span className="muted">never</span>;
  }

  return (
    <span>
      {when ? (
        <span title={new Date(when).toLocaleString()}>{formatAge(when)}</span>
      ) : (
        <span className="muted">never</span>
      )}
      {nightly ? (
        <>
          <br />
          <span className="muted" title={new Date(nightly).toLocaleString()}>
            {dealer.last_refresh_published ?? 0} published, {dealer.last_refresh_skipped ?? 0} skipped
          </span>
        </>
      ) : null}
      {sync && (!nightly || syncIsNewer) ? (
        <>
          <br />
          <span className="muted" title={new Date(sync).toLocaleString()}>
            read {dealer.last_sync_found ?? 0}, {dealer.last_sync_added ?? 0} new
          </span>
        </>
      ) : null}
      <br />
      {dealer.photo_count > 0 || dealer.listings_missing_photos > 0 ? (
        <span className="muted">{dealer.photo_count} photos</span>
      ) : (
        <span className="muted">no live listings</span>
      )}
      {dealer.listings_missing_photos > 0 ? (
        <>
          {' '}
          <span className="badge wait">{dealer.listings_missing_photos} missing photos</span>
        </>
      ) : null}
      {dealer.last_sync_complete === false ? (
        <>
          <br />
          <span
            className="badge wait"
            title="The catalogue read stopped at the size limit; absence was not treated as sold.">
            incomplete
          </span>
        </>
      ) : null}
      {errors.length > 0 ? (
        <>
          <br />
          <span className="errtext" title={errors.join('\n')}>
            {errors.join(' · ')}
          </span>
        </>
      ) : null}
    </span>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
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

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  return (
    <th className={numeric ? 'num' : undefined}>
      <button
        className="sort"
        aria-pressed={sort === sortKey}
        onClick={() => onSort(sort === sortKey && sortKey !== 'newest' ? 'newest' : sortKey)}>
        {label}
        {sort === sortKey ? ' ·' : ''}
      </button>
    </th>
  );
}

function ClaimLine({
  dealer,
  code,
  copied,
  busy,
  onIssue,
  onRevoke,
  onUnassign,
  onCopy,
}: {
  dealer: Row;
  code: { code: string; expiresAt: string } | null;
  copied: boolean;
  busy: boolean;
  onIssue: () => void;
  onRevoke: () => void;
  onUnassign: () => void;
  onCopy: (code: string) => void;
}) {
  const liveUntil = code?.expiresAt ?? dealer.claim_code_expires_at;
  return (
    <span className="claim">
      {dealer.claimed_by ? (
        <>
          <span className="small">
            Claimed by {dealer.claimer_name || 'an account'}
            {dealer.claimer_handle ? ` (@${dealer.claimer_handle})` : ''}
            {dealer.claimer_last_sign_in_at ? ` · signed in ${formatAge(dealer.claimer_last_sign_in_at)}` : ''}
          </span>
          <button className="ghost" disabled={busy} onClick={onUnassign}>
            Unassign
          </button>
        </>
      ) : (
        <span className="muted small">Nobody has claimed this shop.</span>
      )}
      {code ? (
        <span className="code">
          <input readOnly value={code.code} aria-label="Claim code" />
          <button className="ghost" type="button" onClick={() => onCopy(code.code)}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      ) : null}
      {liveUntil ? (
        <span className="muted small">Code live until {new Date(liveUntil).toLocaleString()}</span>
      ) : null}
      {dealer.claimed_by ? null : (
        <button className="ghost" disabled={busy} onClick={onIssue}>
          {liveUntil ? 'New code' : 'Claim code'}
        </button>
      )}
      {liveUntil ? (
        <button className="ghost" disabled={busy} onClick={onRevoke}>
          Revoke code
        </button>
      ) : null}
    </span>
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
