import { formatAge, groupRuns, type RefreshRun } from './refreshHealth';

export function Refresh({
  runs,
  runsUnavailable,
  error,
  highlightDealerId,
  onOpenDealer,
  onReload,
}: {
  runs: RefreshRun[] | null;
  runsUnavailable: boolean;
  error: string | null;
  highlightDealerId?: string;
  onOpenDealer: (dealerId: string) => void;
  onReload: () => void;
}) {
  const groups = runs ? groupRuns(runs) : [];

  return (
    <section>
      <header className="bar">
        <h1>Refresh</h1>
        <button className="ghost push" onClick={onReload}>
          Reload
        </button>
      </header>
      <p className="muted legend">
        One row is one night, or one manual run of the catalogue job: the shops it wrote share a finish
        time. Counts are shops. A catalogue read from Dealers does not add a row here.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {runs === null ? (
        <p className="muted">Loading…</p>
      ) : runsUnavailable ? (
        <p className="muted">
          This database has no refresh history function yet. Apply the migration, then reload.
        </p>
      ) : groups.length === 0 ? (
        <p className="muted">
          No runs recorded. The next nightly job, or running the Catalogue refresh workflow by hand, writes
          the first row.
        </p>
      ) : (
        <div className="scroller">
          <table className="runs">
            <thead>
              <tr>
                <th>When</th>
                <th className="num">Ok</th>
                <th className="num">Fatal</th>
                <th className="num">Error</th>
                <th className="num">Skipped</th>
                <th>Shops</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const problems = group.shops.filter((shop) => !shop.skipped && (shop.fatal || !shop.ok));
                const marked = group.shops.some((shop) => shop.dealer_id === highlightDealerId);
                return (
                  <tr key={group.finished_at} className={marked ? 'mark' : undefined}>
                    <td data-label="When">
                      <span title={new Date(group.finished_at).toLocaleString()}>
                        {formatAge(group.finished_at)}
                      </span>
                    </td>
                    <td className="num" data-label="Ok">
                      {group.ok}
                    </td>
                    <td className="num" data-label="Fatal">
                      {group.fatal > 0 ? <span className="badge live">{group.fatal}</span> : group.fatal}
                    </td>
                    <td className="num" data-label="Error">
                      {group.error > 0 ? <span className="badge wait">{group.error}</span> : group.error}
                    </td>
                    <td className="num" data-label="Skipped">
                      {group.skipped}
                    </td>
                    <td data-label="Shops">
                      {problems.length === 0 ? (
                        <span className="muted">
                          {group.shops
                            .filter((shop) => !shop.skipped)
                            .map((shop) => shop.dealer_name)
                            .join(', ') || '—'}
                        </span>
                      ) : (
                        <ul className="problems">
                          {problems.map((shop) => (
                            <li key={shop.dealer_id}>
                              <span>
                                {shop.dealer_name} — {shop.error ?? (shop.fatal ? 'fatal' : 'failed')}
                              </span>
                              <button className="ghost" onClick={() => onOpenDealer(shop.dealer_id)}>
                                Open shop
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
