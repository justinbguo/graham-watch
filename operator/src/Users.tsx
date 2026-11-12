import { useEffect, useState } from 'react';

import {
  barShare,
  formatDuration,
  formatFee,
  formatPercent,
  labelAnswer,
  parseDashboard,
  type CountPoint,
  type Dashboard,
  type Rollup,
} from './dashboard';
import { supabase } from './supabase';

/** Counts from the tables the app already writes. No chart library: a bar is a div. */
export function Users() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase.rpc('operator_dashboard').then(({ data, error: failed }) => {
      if (!live) return;
      setError(failed?.message ?? null);
      setDash(data ? parseDashboard(data) : null);
    });
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!dash) return <p className="muted">Loading…</p>;

  return (
    <section>
      <header className="toolbar">
        <h1>Users</h1>
      </header>
      <div className="stats">
        <Stat label="Users" value={String(dash.totals.users)} />
        <Stat label="Onboarded" value={formatPercent(dash.totals.onboarding_rate)} hint={`${dash.totals.onboarded} finished`} />
        <Stat label="Buyers" value={String(dash.totals.buyers)} />
        <Stat label="Dealers" value={String(dash.totals.dealers)} />
        <Stat label="Active today" value={String(dash.activity.dau)} hint={`${dash.activity.dauSignins} signed in · ${dash.activity.dauSwipers} swiped`} />
        <Stat label="Active this week" value={String(dash.activity.wau)} hint={`${dash.activity.wauSignins} signed in · ${dash.activity.wauSwipers} swiped`} />
      </div>

      <div className="cols">
        <Chart title="Signups by day" points={dash.signupsByDay} />
        <Chart title="Signups by week" points={dash.signupsByWeek} />
        <Chart title="Swipes by day" points={dash.activity.swipesByDay} />
      </div>

      <div className="block">
        <h2>Onboarding answers</h2>
        <div className="cols">
          <RollupList title="Favourite brands" rows={dash.onboarding.favoriteBrands} />
          <RollupList title="Hunting for" rows={dash.onboarding.huntingFor} />
          <RollupList title="Collection size" rows={dash.onboarding.collectionSize} />
          <RollupList title="Years collecting" rows={dash.onboarding.collectingYears} />
          <RollupList title="What makes search hard" rows={dash.onboarding.searchPainPoints} />
        </div>
      </div>

      <div className="block">
        <h2>Saves</h2>
        <p className="muted small">
          {dash.swipes.swipes} swipes · {formatPercent(dash.swipes.rightRate)} right ·{' '}
          {dash.swipes.perUser} swipes per person who swiped · {dash.follows.total} shop follows
        </p>
        <div className="cols">
          <div>
            <h3 className="small">Top saved watches</h3>
            {dash.topSavedListings.length === 0 ? (
              <p className="muted small">No right swipes yet.</p>
            ) : (
              <ul className="rows tight">
                {dash.topSavedListings.map((listing) => (
                  <li key={listing.listingId}>
                    <strong>{[listing.brand, listing.model].filter(Boolean).join(' ')}</strong>
                    <span className="muted small"> {listing.dealerName} · {listing.saves}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="small">Top saved shops</h3>
            {dash.topSavedDealers.length === 0 ? (
              <p className="muted small">No right swipes yet.</p>
            ) : (
              <ul className="rows tight">
                {dash.topSavedDealers.map((dealer) => (
                  <li key={dealer.dealerId}>
                    <strong>{dealer.name}</strong>
                    <span className="muted small"> {dealer.saves} saves</span>
                  </li>
                ))}
              </ul>
            )}
            {dash.follows.dealers.length > 0 ? (
              <p className="muted small">
                Followed:{' '}
                {dash.follows.dealers.map((dealer) => `${dealer.name} (${dealer.followers})`).join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="block">
        <h2>Inquiries to deals</h2>
        <div className="stats">
          <Stat label="Inquiries" value={String(dash.funnel.inquiries)} />
          <Stat label="Conversations" value={String(dash.funnel.conversations)} />
          <Stat label="Messages" value={String(dash.funnel.messages)} />
          <Stat label="Fee revenue" value={formatFee(dash.funnel.feeCents)} hint="Funded, shipped, and completed" />
        </div>
        {dash.funnel.deals.length === 0 ? (
          <p className="muted small">No deals yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Deal status</th>
                <th className="num">Count</th>
                <th className="num">Fees</th>
              </tr>
            </thead>
            <tbody>
              {dash.funnel.deals.map((deal) => (
                <tr key={deal.status}>
                  <td>{labelAnswer(deal.status)}</td>
                  <td className="num">{deal.count}</td>
                  <td className="num">{formatFee(deal.feeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="block">
        <h2>Dealer response</h2>
        <p className="muted small">
          A thread counts as answered when the person who claimed the shop replies after the buyer’s first message.
          The time is the median of those waits.
        </p>
        {dash.dealerResponse.length === 0 ? (
          <p className="muted small">No shop threads yet.</p>
        ) : (
          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th className="num">Threads</th>
                  <th className="num">Answered</th>
                  <th className="num">Rate</th>
                  <th className="num">Median wait</th>
                </tr>
              </thead>
              <tbody>
                {dash.dealerResponse.map((dealer) => (
                  <tr key={dealer.dealerId}>
                    <td>{dealer.name}</td>
                    <td className="num">{dealer.threads}</td>
                    <td className="num">{dealer.answered}</td>
                    <td className="num">{formatPercent(dealer.responseRate)}</td>
                    <td className="num">{formatDuration(dealer.medianResponseSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="muted small">{hint}</span> : null}
    </div>
  );
}

function Chart({ title, points }: { title: string; points: CountPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);
  return (
    <div className="block">
      <h2>{title}</h2>
      {points.length === 0 ? (
        <p className="muted small">No data.</p>
      ) : (
        <>
          <div className="bars" role="img" aria-label={`${title}, ${total} in total`}>
            {points.map((point) => (
              <div key={point.label} className="bar" title={`${point.label}: ${point.count}`}>
                <div className="bar-fill" style={{ height: `${barShare(point.count, max)}%` }} />
              </div>
            ))}
          </div>
          <p className="muted small">
            {points[0]?.label} – {points[points.length - 1]?.label} · {total}
          </p>
        </>
      )}
    </div>
  );
}

function RollupList({ title, rows }: { title: string; rows: Rollup[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div>
      <h3 className="small">{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">No answers yet.</p>
      ) : (
        <div className="roll">
          {rows.map((row) => (
            <div key={row.value} className="roll-row">
              <span className="small">{labelAnswer(row.value)}</span>
              <span className="roll-track">
                <span className="roll-fill" style={{ width: `${barShare(row.count, max)}%` }} />
              </span>
              <span className="num small">{row.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
