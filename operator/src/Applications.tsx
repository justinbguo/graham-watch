import { useEffect, useState } from 'react';

import { supabase, VOLUME_LABELS, type Application } from './supabase';

type Status = Application['status'];

const TABS: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
];

export function Applications() {
  const [status, setStatus] = useState<Status>('pending');
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reloading is a counter rather than a function call so the effect owns every
  // fetch. Switching tabs quickly would otherwise let the slower answer land
  // last and show the wrong list under the wrong heading.
  const [tick, setTick] = useState(0);
  const reload = () => setTick((value) => value + 1);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error: failed } = await supabase
        .from('dealer_applications')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: true });

      if (!live) return;
      setError(failed?.message ?? null);
      setRows(data ?? []);
    })();
    return () => {
      live = false;
    };
  }, [status, tick]);

  async function answer(application: Application, verdict: 'accept' | 'decline') {
    setBusyId(application.id);
    setError(null);
    try {
      if (verdict === 'accept') {
        const { error: failed } = await supabase.rpc('approve_dealer_application', {
          p_application_id: application.id,
        });
        if (failed) throw failed;
      } else {
        const note = window.prompt(
          `Why is ${application.shop_name} declined? They read this on their profile.`
        );
        if (note === null) return;
        const { error: failed } = await supabase.rpc('decline_dealer_application', {
          p_application_id: application.id,
          p_note: note,
        });
        if (failed) throw failed;
      }
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
        <nav className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              className={tab.value === status ? 'tab on' : 'tab'}
              onClick={() => setStatus(tab.value)}>
              {tab.label}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={reload}>
          Reload
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nothing here.</p>
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
                {application.note ? <p className="quote">{application.note}</p> : null}
              </div>

              {status === 'pending' ? (
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
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
