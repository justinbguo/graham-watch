import { useEffect, useState } from 'react';

import { actionLabel, changeSummary } from './activityCopy';
import { supabase, type Database } from './supabase';

type Row = Database['public']['Functions']['operator_activity']['Returns'][number];

/** The audit log. One row per operator write, newest first. */
export function Activity() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase.rpc('operator_activity', { p_limit: 80 }).then(({ data, error: failed }) => {
      if (!live) return;
      setError(failed?.message ?? null);
      setRows(data ?? []);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section>
      <header className="bar">
        <h1>Activity</h1>
      </header>
      <p className="muted small legend">
        Every approve, pause, listing change, claim code, and unassign. The code itself is not stored.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing recorded yet.</p>
      ) : (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="small" title={new Date(row.created_at).toLocaleString()}>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="small">{row.operator_label}</td>
                  <td>
                    {actionLabel(row.action)}
                    <br />
                    <span className="muted small">
                      {row.target_type}
                      {row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ''}
                    </span>
                  </td>
                  <td className="small">{changeSummary(row.before, row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
