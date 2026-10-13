import { useEffect, useState } from 'react';

import { confirmWrite, supabase, VOLUME_LABELS, type Application } from './supabase';

/**
 * An inbox: shops waiting on an answer, and nothing else.
 *
 * Answered applications are deliberately absent. An accepted one becomes a shop
 * and belongs on Dealers, where it can still be published or pulled back;
 * keeping a copy here would mean two screens claiming to own the same thing.
 * A declined one is not a record to keep either — the applicant reads the note
 * on their profile and may reapply, which files a new row.
 */
export function Applications() {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((value) => value + 1);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error: failed } = await supabase
        .from('dealer_applications')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (!live) return;
      setError(failed?.message ?? null);
      setRows(data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [tick]);

  async function answer(application: Application, verdict: 'accept' | 'decline') {
    if (verdict === 'accept') {
      // Accepting hands the shop to the account that applied, and publishes it.
      // Both are hard to walk back once a dealer is editing listings.
      if (
        !confirmWrite(
          `Give ${application.shop_name} to ${application.verified_email}, and publish it?`
        )
      ) {
        return;
      }
    }

    const note =
      verdict === 'decline'
        ? window.prompt(
            `Why is ${application.shop_name} declined? They read this on their profile.`
          )
        : null;
    if (verdict === 'decline' && note === null) return;

    setBusyId(application.id);
    setError(null);
    try {
      const { error: failed } =
        verdict === 'accept'
          ? await supabase.rpc('approve_dealer_application', {
              p_application_id: application.id,
            })
          : await supabase.rpc('decline_dealer_application', {
              p_application_id: application.id,
              p_note: note ?? '',
            });
      if (failed) throw failed;
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <header className="bar">
        <h1>
          Waiting on you
          {rows && rows.length > 0 ? <span className="badge">{rows.length}</span> : null}
        </h1>
        <button className="ghost push" onClick={reload}>
          Reload
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">
          No shops are waiting. Accepted ones are on Dealers.
        </p>
      ) : (
        <ul className="rows">
          {rows.map((application) => (
            <li key={application.id} className="row">
              <div className="grow">
                <h2>
                  {application.shop_name}
                  {application.verified_at ? (
                    <span className="badge ok">mailbox proved</span>
                  ) : (
                    <span className="badge wait">not proved</span>
                  )}
                </h2>
                <p className="muted">
                  <a href={application.website} target="_blank" rel="noreferrer">
                    {application.website}
                  </a>
                  {' · '}
                  {VOLUME_LABELS[application.volume]} at a time
                </p>
                <p>{application.brands.length ? application.brands.join(' · ') : 'No brands given'}</p>
                <p className="muted small">
                  {application.verified_email ?? 'no address proved yet'}
                  {' · applied '}
                  {new Date(application.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="actions">
                {/* Accepting is refused by the database until the mailbox is
                    proved, so the button says so rather than offering a click
                    that returns an error. */}
                <button
                  disabled={busyId === application.id || !application.verified_at}
                  title={application.verified_at ? undefined : 'Waiting on the applicant'}
                  onClick={() => void answer(application, 'accept')}>
                  Accept
                </button>
                <button
                  className="ghost"
                  disabled={busyId === application.id}
                  onClick={() => void answer(application, 'decline')}>
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
