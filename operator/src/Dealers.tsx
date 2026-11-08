import { Fragment, useEffect, useState } from 'react';

import {
  shopErrors,
  visibleDealers,
  type FlagFilter,
  type ShopStatus,
  type SortKey,
} from './dealerTable';
import {
  dealerLastSyncAt,
  lastSyncTone,
  refreshAlert,
  type RefreshSchedule,
} from './refreshSchedule';
import { ImportActivityLog } from './ImportActivityLog';
import { ImportPreview } from './ImportPreview';
import {
  deleteDealer,
  importListings,
  stageImport,
  syncCatalog,
  type ImportCandidate,
  type PublishTotals,
} from './importer';
import { refreshAllShops, shopsToRefresh, summariseRefreshAll } from './refreshAll';
import { LastSyncButton, LastSyncDetail } from './LastSync';
import { lastSyncCell } from './lastSync';
import { ShopListings } from './ShopListings';
import { confirmDelete, confirmWrite, supabase, type OperatorDealer, type Permission } from './supabase';

type Row = OperatorDealer;

/**
 * What the scrape read off the shop's own site. It comes from a plain table
 * read rather than `operator_dealers`, because these three columns are granted
 * to every signed-in reader while the RPC exists for the ones that are not.
 */
type Profile = { description: string | null; instagram: string | null };

/** The shop whose catalogue is open, and what the read that opened it found. */
type Picking = { dealer: Row; note: string | null; skipSync?: boolean };

export function Dealers({ onOpenInbox }: { onOpenInbox?: (dealer: Row) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [importLog, setImportLog] = useState<string[]>([]);

  const appendImportLog = (message: string) => {
    const time = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setImportLog((lines) => [...lines, `${time}  ${message}`]);
  };
  const [listingsFor, setListingsFor] = useState<Row | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ShopStatus>('all');
  const [flagFilter, setFlagFilter] = useState<FlagFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [codes, setCodes] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<RefreshSchedule | null>(null);
  const [newCounts, setNewCounts] = useState<Record<string, number> | null>(null);
  const [openSyncId, setOpenSyncId] = useState<string | null>(null);
  const [reloadPublish, setReloadPublish] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((value) => value + 1);

  function reloadAll() {
    const shops = shopsToRefresh(rows ?? []);
    if (shops.length === 0) {
      reload();
      return;
    }

    const publishNote = reloadPublish
      ? ' Then publish every for-sale watch with at least three photos (skips the rest).'
      : '';
    if (
      !confirmWrite(
        `Sync all ${shops.length} approved shop(s)? Each reads their live catalogue.${publishNote} This can take several minutes.`
      )
    ) {
      return;
    }

    setBusyId('__reload__');
    setError(null);
    setProgress(`Starting sync for ${shops.length} shop(s)…`);

    void (async () => {
      try {
        const results = await refreshAllShops(shops, { publish: reloadPublish }, setProgress);
        setProgress(summariseRefreshAll(results));
        reload();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Reload did not finish.');
        setProgress(null);
      } finally {
        setBusyId(null);
      }
    })();
  }

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
      const [{ data, error: failed }, shops, health, additions] = await Promise.all([
        supabase.rpc('operator_dealers'),
        supabase.from('dealers').select('id, description, instagram'),
        supabase.rpc('operator_refresh_schedule'),
        supabase.rpc('operator_last_sync_counts'),
      ]);

      if (!live) return;
      setError(
        failed?.message ??
          shops.error?.message ??
          health.error?.message ??
          additions.error?.message ??
          null,
      );
      setNewCounts(
        additions.error
          ? null
          : Object.fromEntries((additions.data ?? []).map((row) => [row.dealer_id, Number(row.new_count)])),
      );
      setRows(data ?? []);
      setSchedule((health.data?.[0] as RefreshSchedule | undefined) ?? null);
      setProfiles(
        Object.fromEntries(
          (shops.data ?? []).map(({ id, description, instagram }) => [id, { description, instagram }])
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
      const message = caught instanceof Error ? caught.message : 'That did not work.';
      setError(message);
      setImportLog((lines) => [...lines, `Error: ${message}`]);
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
  function importSome(dealer: Row, candidates: ImportCandidate[], skipSync = false) {
    const count = candidates.filter((candidate) => candidate.selected).length;
    if (!dealer.website) {
      setError(`${dealer.name} has no website, so stock cannot be verified before import.`);
      return;
    }
    if (!confirmWrite(`Import ${count} watch(es) from ${dealer.name}?`)) return;
    setImportLog([]);
    appendImportLog(`Confirmed ${count} watch(es) for ${dealer.name}.`);
    void run(dealer, async () => {
      if (skipSync) {
        setProgress(`${dealer.name}: staging selection…`);
        appendImportLog('Skipping catalogue re-read — you just synced this shop.');
      } else {
        setProgress(`${dealer.name}: re-reading site…`);
        appendImportLog('Re-reading their site for sold watches…');
        const sync = await syncCatalog({ sourceUrl: dealer.website!, dealerId: dealer.id });
        appendImportLog(
          `Catalogue read: ${sync.forSale} for sale, ${sync.added} new, ${sync.retired} retired.`
        );
      }

      appendImportLog('Saving your selection to the import queue…');
      const queued = await stageImport(dealer.id, candidates);
      if (queued === 0) {
        appendImportLog('Nothing left to queue — selected watches may have sold since you picked them.');
      } else {
        appendImportLog(`Queued ${queued} watch(es). Starting publish batches…`);
      }

      const totals = await importListings(
        dealer.id,
        (at) => {
          setProgress(
            `${dealer.name}: ${at.published} published, ${at.skipped} skipped, ${at.pending} queued…`
          );
        },
        (line) => appendImportLog(line)
      );
      const result = summarise(dealer.name, queued, totals);
      const sold = count - queued;
      appendImportLog(result);
      setPicking(null);
      return sold > 0 ? `${sold} selected watch(es) were no longer for sale. ${result}` : result;
    });
  }

  /** Re-reads the site, then opens the import picker on what was found. */
  function syncAndImport(dealer: Row) {
    if (!dealer.website) {
      setError(`${dealer.name} has no website to read.`);
      return;
    }
    void run(dealer, async () => {
      const result = await syncCatalog({ sourceUrl: dealer.website!, dealerId: dealer.id });
      setPicking({
        dealer,
        note: `Just read their site: ${result.forSale} for sale, ${result.added} we had not seen before, ${result.retired} gone.`,
        skipSync: true,
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

  function removeDealer(dealer: Row) {
    const held = Number(dealer.listings_held);
    const claimed = dealer.claimed_by
      ? `${dealer.claimer_handle ? `@${dealer.claimer_handle}` : 'The dealer'} will lose this shop.`
      : null;
    const asked = [
      `Delete ${dealer.name} permanently?`,
      held > 0
        ? `${held} imported watch(es), their photos, wishlists, and inquiries are removed.`
        : 'Their catalogue and import history are removed.',
      claimed,
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!confirmDelete(asked)) return;

    void run(dealer, async () => {
      const result = await deleteDealer(dealer.id);
      setListingsFor((current) => (current?.id === dealer.id ? null : current));
      setPicking((current) => (current?.dealer.id === dealer.id ? null : current));
      return `${dealer.name} deleted (${result.photos} photo file(s) removed).`;
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
      <header className="toolbar">
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
          <option value="last_error">Last error</option>
        </select>
        <div className="toolbar-end push">
          <label className="reload-publish">
            <input
              type="checkbox"
              checked={reloadPublish}
              onChange={(event) => setReloadPublish(event.target.checked)}
              disabled={busyId !== null}
            />
            Publish all
          </label>
          <button className="ghost" onClick={reloadAll} disabled={busyId !== null}>
            Reload
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {schedule ? <RefreshBanner schedule={schedule} /> : null}
      {progress ? <p className="muted small import-headline">{progress}</p> : null}
      {importLog.length > 0 && !picking ? (
        <ImportActivityLog
          lines={importLog}
          busy={busyId !== null}
          onClear={() => setImportLog([])}
        />
      ) : null}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          No shops yet. Add some on <strong>Add shops</strong>.
        </p>
      ) : (
        <>
          <div className="table-card scroller">
          <table className="dealers">
            <colgroup>
              <col className="shop" />
              <col className="email" />
              <col className="description" />
              <col className="stock" />
              <col className="sync" />
              <col className="new-sync" />
              <col className="status" />
              <col className="actions" />
            </colgroup>
            <thead>
              <tr>
                <SortHeader label="Shop" sortKey="name" sort={sort} onSort={setSort} />
                <th>Email</th>
                <th>Description</th>
                <SortHeader
                  label="# listings"
                  sortKey="listings"
                  sort={sort}
                  onSort={setSort}
                  numeric
                  title="Imported watches we hold for this shop (held count)"
                />
                <SortHeader
                  label="Last sync"
                  sortKey="last_sync"
                  sort={sort}
                  onSort={setSort}
                  title="Last catalogue read or successful nightly refresh. Turns red after 48 hours."
                />
                <th
                  className="new-sync"
                  title="Listings first seen on the latest catalogue read. Never means this shop has no read recorded. 0 means that read did not create a listing.">
                  New on last sync
                </th>
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={setSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((dealer) => {
                const listingCount = Number(dealer.listings_held);
                const profile = profiles[dealer.id];
                const syncCell =
                  dealer.last_synced_at && newCounts === null
                    ? null
                    : lastSyncCell(dealer.last_synced_at, newCounts?.[dealer.id] ?? 0);
                const syncOpen = openSyncId === dealer.id;

                return (
                  <Fragment key={dealer.id}>
                  <tr className={syncOpen ? 'open' : undefined}>
                    <td>
                      <div className="shopcell">
                        <div className="grow">
                          <strong>{dealer.name}</strong>
                          {dealer.website ? (
                            <a
                              className="muted small oneline"
                              href={dealer.website}
                              target="_blank"
                              rel="noreferrer"
                              title={dealer.website}>
                              {siteLabel(dealer.website)}
                            </a>
                          ) : (
                            <span className="muted small">no website</span>
                          )}
                          {profile?.instagram ? (
                            <a
                              className="small"
                              href={`https://instagram.com/${profile.instagram}`}
                              target="_blank"
                              rel="noreferrer">
                              @{profile.instagram}
                            </a>
                          ) : null}
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

                    <td className="email-cell">
                      {dealer.contact_email ? (
                        <a
                          className="small oneline"
                          href={`mailto:${dealer.contact_email}`}
                          title={dealer.contact_email}>
                          {dealer.contact_email}
                        </a>
                      ) : (
                        <span className="badge wait">no email</span>
                      )}
                    </td>

                    <td className="description-cell">
                      {profile?.description ? (
                        <span className="muted small cell-clamp" title={profile.description}>
                          {profile.description}
                        </span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>

                    <td className="num" title="Imported watches we hold for this shop">
                      <strong>{listingCount}</strong>
                    </td>

                    <td className="sync">
                      <SyncStatus dealer={dealer} />
                    </td>

                    <td className="new-sync">
                      {syncCell ? (
                        <LastSyncButton
                          cell={syncCell}
                          expanded={syncOpen}
                          onToggle={() => setOpenSyncId(syncOpen ? null : dealer.id)}
                        />
                      ) : (
                        <span className="muted">…</span>
                      )}
                    </td>

                    <td className="status">
                      <ShopStatus dealer={dealer} onOpenInbox={onOpenInbox} />
                    </td>

                    <td className="actions">
                      <div className="action-stack">
                        <button
                          className="ghost compact"
                          disabled={busyId !== null}
                          title="Active imports and for-sale watches on their site"
                          onClick={() => setListingsFor(dealer)}>
                          View listings
                        </button>
                        <button
                          className="ghost compact"
                          disabled={busyId !== null || !dealer.can_import}
                          title={
                            dealer.can_import
                              ? 'Read their website, then choose watches to import. Reading is free; import runs when you confirm.'
                              : 'This shop is self-managed — the dealer runs their own catalogue.'
                          }
                          onClick={() => syncAndImport(dealer)}>
                          Sync
                        </button>
                        <ShopPermission dealer={dealer} busy={busyId !== null} onSet={setPermission} compact />
                        <button
                          className="ghost compact danger-text"
                          disabled={busyId !== null}
                          title="Permanently delete this shop, every imported watch, and their photos. Type DELETE to confirm."
                          onClick={() => removeDealer(dealer)}>
                          Delete shop
                        </button>
                      </div>
                    </td>
                  </tr>
                  {syncOpen && syncCell ? (
                    <tr className="detail-row">
                      <td colSpan={8}>
                        <LastSyncDetail dealerId={dealer.id} cell={syncCell} />
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>

          <details className="legend">
            <summary className="muted small">What the columns mean</summary>
            <p className="muted small">
              <strong># listings</strong> is every watch you imported. <strong>View listings</strong>{' '}
              opens Active and On site tabs. <strong>Last sync</strong> goes red after 48 hours without a
              catalogue read or successful nightly refresh. <strong>New on last sync</strong> counts listings first seen on that read.
              Never means no read is recorded. 0 means the read did not create a listing, which is
              normal when the shop's stock did not change. <strong>Sync</strong> reads the site then lets you
              import; you only pay when you confirm watches.
            </p>
          </details>
        </>
      )}

      {picking ? (
        <ImportPreview
          dealerId={picking.dealer.id}
          dealerName={picking.dealer.name}
          note={picking.note}
          importing={busyId === picking.dealer.id}
          activityLog={importLog}
          onClearLog={() => setImportLog([])}
          onClose={() => setPicking(null)}
          onImport={(candidates) => importSome(picking.dealer, candidates, picking.skipSync)}
        />
      ) : null}

      {listingsFor ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setListingsFor(null)}>
          <section
            className="import-modal listings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="listings-title"
            onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <div>
                <p className="eyebrow">Listings</p>
                <h1 id="listings-title">{listingsFor.name}</h1>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close listings"
                onClick={() => setListingsFor(null)}>
                ×
              </button>
            </header>
            <ShopListings
              dealerId={listingsFor.id}
              inDeck={Number(listingsFor.listings_in_deck)}
              catalogTotal={listingsFor.catalog_total}
              canImport={listingsFor.can_import}
              reload={tick}
              onChanged={reload}
              onImport={(candidates) => importSome(listingsFor, candidates)}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}

function permissionQuestion(dealer: Row, permission: Permission): string {
  if (permission === 'paused') {
    return `Pause ${dealer.name}? Buyers stop seeing their watches, and the nightly refresh skips them, until you resume.`;
  }
  if (dealer.permission === 'paused' || dealer.permission === 'revoked') {
    return `Resume ${dealer.name}? Their ${dealer.listings_held} imported watch(es) go back in front of buyers, and the nightly refresh includes them again.`;
  }
  return `Put ${dealer.name}'s ${dealer.listings_held} imported watch(es) in front of buyers?`;
}

function ShopPermission({
  dealer,
  busy,
  onSet,
  compact,
}: {
  dealer: Row;
  busy: boolean;
  onSet: (dealer: Row, permission: Permission) => void;
  compact?: boolean;
}) {
  const btn = compact ? 'ghost compact' : 'ghost';
  if (dealer.permission === 'approved') {
    return (
      <button
        className={btn}
        disabled={busy}
        title="Remove this shop from the buyer deck and skip it in the nightly site refresh until you resume."
        onClick={() => onSet(dealer, 'paused')}>
        Pause
      </button>
    );
  }

  if (dealer.permission === 'paused' || dealer.permission === 'revoked') {
    return (
      <button
        className={compact ? 'compact' : undefined}
        disabled={busy}
        title="Put this shop back in the deck and include it in the nightly refresh again."
        onClick={() => onSet(dealer, 'approved')}>
        {dealer.permission === 'revoked' ? 'Publish' : 'Resume'}
      </button>
    );
  }

  return (
    <button
      className={compact ? 'compact' : undefined}
      disabled={busy}
      title="Approve the shop so buyers can see its imported watches in the deck."
      onClick={() => onSet(dealer, 'approved')}>
      Publish
    </button>
  );
}

function ShopStatus({ dealer, onOpenInbox }: { dealer: Row; onOpenInbox?: (dealer: Row) => void }) {
  const flags = dealer.neglect_flags ?? [];
  return (
    <div className="status-stack">
      <span className={`badge ${dealer.permission === 'approved' ? 'ok' : 'wait'}`}>{dealer.permission}</span>
      {flags.map((flag) => (
        <span key={flag} className="badge wait">
          {flag === 'quiet' ? 'quiet' : flag === 'unanswered' ? 'unanswered' : flag}
        </span>
      ))}
      {dealer.unanswered_count > 0 ? (
        <button
          type="button"
          className="ghost compact inbox-link"
          title="Read threads and inquiries for this shop"
          onClick={() => onOpenInbox?.(dealer)}>
          {dealer.unanswered_count} waiting
        </button>
      ) : onOpenInbox ? (
        <button
          type="button"
          className="ghost compact inbox-link"
          title="Read threads for this shop"
          onClick={() => onOpenInbox(dealer)}>
          Inbox
        </button>
      ) : null}
    </div>
  );
}

function RefreshBanner({ schedule }: { schedule: RefreshSchedule }) {
  const alert = refreshAlert(schedule);
  return (
    <div className={`refresh-banner ${alert.level}`} role="status">
      <strong>{alert.title}</strong>
      <span className="muted small">{alert.detail}</span>
    </div>
  );
}

function SyncStatus({ dealer }: { dealer: Row }) {
  const okAt = dealer.last_refresh_ok_at;
  const attemptAt = dealer.last_refresh_at;
  const sync = dealer.last_synced_at;
  const errors = shopErrors(dealer);
  const attemptFailed =
    attemptAt != null &&
    dealer.last_refresh_attempt_ok === false &&
    Boolean(dealer.last_refresh_error);

  const lastSync = dealerLastSyncAt(dealer);
  const tone = lastSyncTone(lastSync);

  const detail = [
    lastSync ? `Last sync ${new Date(lastSync).toLocaleString()}` : 'No catalogue read or nightly refresh logged',
    okAt ? `Last ok nightly refresh ${new Date(okAt).toLocaleString()}` : null,
    attemptAt
      ? `Last attempt ${new Date(attemptAt).toLocaleString()} — ${
          dealer.last_refresh_attempt_ok ? 'ok' : dealer.last_refresh_error ?? 'failed'
        }`
      : null,
    sync ? `Catalogue read ${new Date(sync).toLocaleString()}` : null,
    sync && dealer.last_sync_error ? dealer.last_sync_error : null,
    ...errors.filter((e) => e !== dealer.last_refresh_error),
  ]
    .filter(Boolean)
    .join('\n');

  const chips = [
    attemptFailed ? (
      <span key="refresh" className="badge bad" title={dealer.last_refresh_error ?? undefined}>
        refresh failed
      </span>
    ) : null,
    errors.length > 0 && !attemptFailed ? (
      <span key="sync" className="badge bad" title={errors.join('\n')}>
        sync error
      </span>
    ) : null,
    dealer.last_sync_complete === false ? (
      <span
        key="partial"
        className="badge wait"
        title="Catalogue read hit the size limit; absence was not treated as sold.">
        partial read
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="sync-stack" title={detail || undefined}>
      <span className={`sync-age sync-age-${tone}`}>
        {lastSync ? formatAge(lastSync) : 'never'}
      </span>
      {chips.length > 0 ? <div className="chips">{chips}</div> : null}
    </div>
  );
}

function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
  title,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  numeric?: boolean;
  title?: string;
}) {
  return (
    <th className={numeric ? 'num' : undefined} title={title}>
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
        <span className="claim-row">
          <span className="muted small oneline">
            {dealer.claimer_handle ? `@${dealer.claimer_handle}` : dealer.claimer_name || 'claimed'}
            {dealer.claimer_last_sign_in_at ? ` · ${formatAge(dealer.claimer_last_sign_in_at)}` : ''}
          </span>
          <button
            className="ghost compact"
            disabled={busy}
            title="Remove the dealer account from this shop and burn any live claim code."
            onClick={onUnassign}>
            Unassign
          </button>
        </span>
      ) : (
        <span className="claim-row">
          <span className="muted small">unclaimed</span>
          <button
            className="ghost compact"
            disabled={busy}
            title="Create a 7-day code the dealer can use to claim this shop in the app."
            onClick={onIssue}>
            {liveUntil ? 'New code' : 'Code'}
          </button>
          {liveUntil ? (
            <button
              className="ghost compact"
              disabled={busy}
              title="Invalidate the current claim code so it can no longer be used."
              onClick={onRevoke}>
              Revoke
            </button>
          ) : null}
        </span>
      )}
      {code ? (
        <span className="code">
          <input readOnly value={code.code} aria-label="Claim code" />
          <button
            className="ghost compact"
            type="button"
            title="Copy the claim code to send to the dealer."
            onClick={() => onCopy(code.code)}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
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
