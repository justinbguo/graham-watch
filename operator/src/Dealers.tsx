import { useEffect, useState } from 'react';

import { confirmWrite, supabase, type OperatorDealer, type Permission } from './supabase';

type Row = OperatorDealer;

const NEXT: Record<Permission, Permission> = {
  pending: 'approved',
  approved: 'revoked',
  revoked: 'approved',
};

export function Dealers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function setPermission(dealer: Row, permission: Permission) {
    const asked =
      permission === 'approved'
        ? `Put ${dealer.listings_held} of ${dealer.name}'s watches in front of buyers?`
        : `Pull ${dealer.name} out of the deck? Buyers stop seeing their watches.`;
    if (!confirmWrite(asked)) return;

    setBusyId(dealer.id);
    setError(null);
    const { error: failed } = await supabase.rpc('set_dealer_permission', {
      p_dealer_id: dealer.id,
      p_permission: permission,
    });
    if (failed) setError(failed.message);
    else reload();
    setBusyId(null);
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

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          No shops yet. Add one with <code>npm run dealers -- add &lt;domain&gt;</code>.
        </p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th className="num">In the deck</th>
                <th className="num">Imported</th>
                <th>Contact</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((dealer) => {
                const next = NEXT[dealer.permission];
                const held = dealer.listings_held;
                const inDeck = dealer.listings_in_deck;

                return (
                  <tr key={dealer.id}>
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
                          <span className="muted small">
                            {held - inDeck} not showing
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td className="num">{held}</td>
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
                    <td className="num">
                      <button
                        className={next === 'approved' ? '' : 'ghost'}
                        disabled={busyId === dealer.id}
                        onClick={() => void setPermission(dealer, next)}>
                        {next === 'approved' ? 'Publish' : 'Pull back'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="muted small legend">
            <strong>In the deck</strong> is what a buyer can see right now: the
            watch is active, unsold, and the shop is approved.{' '}
            <strong>Imported</strong> is every watch we hold for them. A gap
            means some are sold or hidden — or that the whole shop is not
            approved, in which case none of them show and <em>Publish</em> is
            what changes that.
          </p>
        </>
      )}
    </section>
  );
}
