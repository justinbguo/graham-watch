import { useEffect, useState } from 'react';

import { formatPacific } from './accounts';
import { guestTitle, parseGuest, parseGuests, visibleGuests, type Guest, type GuestDetail, type GuestEvent } from './guests';
import { formatPrice, photoUrl } from './importer';
import { supabase } from './supabase';

export function Guests({ onOpenAccount }: { onOpenAccount: (userId: string) => void }) {
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOperators, setShowOperators] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; detail: GuestDetail } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    void supabase.rpc('operator_guests').then(({ data, error: failed }) => {
      if (!live) return;
      setError(failed?.message ?? null);
      setGuests(parseGuests(data));
    });
    return () => {
      live = false;
    };
  }, [reload]);

  useEffect(() => {
    if (!opened) return;
    const key = opened;
    let live = true;
    void supabase.rpc('operator_guest', { p_guest_key: key }).then(({ data, error: failed }) => {
      if (!live) return;
      setDetailError(failed?.message ?? null);
      if (data) setLoaded({ key, detail: parseGuest(data) });
    });
    return () => {
      live = false;
    };
  }, [opened, reload]);

  const shown = guests ? visibleGuests(guests, showOperators) : [];
  const detail = opened && loaded?.key === opened ? loaded.detail : null;

  const claim = (guestKey: string) => {
    setClaiming(guestKey);
    setError(null);
    void supabase.rpc('operator_claim_guest', { p_guest_key: guestKey }).then(({ error: failed }) => {
      setClaiming(null);
      if (failed) {
        setError(failed.message);
        return;
      }
      setReload((current) => current + 1);
    });
  };

  return (
    <section>
      <header className="toolbar">
        <h1>Guests</h1>
        <span className="muted small">{guests ? `${shown.length} ${shown.length === 1 ? 'guest' : 'guests'} · ` : ''}times in Pacific</span>
        <button
          className={showOperators ? 'tab on' : 'tab'}
          type="button"
          onClick={() => setShowOperators((current) => !current)}>
          Show operators
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {guests === null ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="muted">{guests.length === 0 ? 'No guests yet.' : 'No guests to show.'}</p>
      ) : (
        <div className="table-card scroller">
          <table>
            <thead>
              <tr>
                <th>Last seen</th>
                <th>First seen</th>
                <th className="num">Sessions</th>
                <th className="num">Viewed</th>
                <th className="num">Pass</th>
                <th className="num">Dealer click</th>
                <th className="num">Inquiry</th>
                <th>Dealers</th>
                <th>Brands</th>
                <th>Country</th>
                <th>Device</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((guest) => (
                <tr key={guest.guestKey} onClick={() => setOpened(guest.guestKey)}>
                  <td>{formatPacific(guest.lastSeenAt, 'dateTime')}</td>
                  <td>{formatPacific(guest.firstSeenAt, 'date')}</td>
                  <td className="num">{guest.sessions}</td>
                  <td className="num">{guest.listingsViewed}</td>
                  <td className="num">{guest.passes}</td>
                  <td className="num">{guest.dealerClicks}</td>
                  <td className="num">{guest.inquiryOpens}</td>
                  <td>{named(guest.dealers)}</td>
                  <td>{named(guest.brands)}</td>
                  <td>{guest.country ?? 'None'}</td>
                  <td>{guest.device ?? 'None'}</td>
                  <td>
                    {guest.claimedBy ? (
                      <button
                        className="ghost compact"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenAccount(guest.claimedBy!);
                        }}>
                        {guest.operator ? guestTitle(guest) : 'Claimed'}
                      </button>
                    ) : (
                      <button
                        className="ghost compact"
                        type="button"
                        disabled={claiming === guest.guestKey}
                        onClick={(event) => {
                          event.stopPropagation();
                          claim(guest.guestKey);
                        }}>
                        This is me
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="block">
        {!opened ? (
          <p className="muted">Pick a guest to read what they viewed.</p>
        ) : (
          <GuestDetailPane detail={detail} error={detailError} />
        )}
      </div>
    </section>
  );
}

function GuestDetailPane({ detail, error }: { detail: GuestDetail | null; error: string | null }) {
  return (
    <>
      <h2>Sessions</h2>
      {error ? <p className="error">{error}</p> : null}
      {!detail ? (
        error ? null : <p className="muted">Loading…</p>
      ) : detail.sessions.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ol className="timeline">
          {detail.sessions.map((session) => (
            <li key={`${session.startedAt}:${session.events[0]?.id ?? 'session'}`}>
              <h3 className="timeline-day">{formatPacific(session.startedAt, 'dateTime')}</h3>
              <ol className="timeline">
                {session.events.map((event) => (
                  <GuestEventRow key={event.id} event={event} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function GuestEventRow({ event }: { event: GuestEvent }) {
  const src = event.thumbPath ? photoUrl(event.thumbPath) : event.thumbSourceUrl;
  const notes = [
    event.dwellMs == null ? null : `${Math.round(event.dwellMs / 1000)}s`,
    event.photoIndex == null ? null : `photo ${event.photoIndex}`,
    event.filter,
  ].filter(Boolean);

  return (
    <li className="timeline-row">
      <span className="timeline-time muted small">{formatPacific(event.at, 'dateTime')}</span>
      <div className="min-0">
        <p className="small">
          <strong>{event.action}</strong>
          {event.surface ? <span className="muted"> · {event.surface}</span> : null}
        </p>
        {event.listingId ? (
          <div className="timeline-subject">
            {src ? (
              <img className="timeline-thumb" src={src} alt="" loading="lazy" />
            ) : (
              <span className="timeline-thumb thumb-gap" aria-hidden="true" />
            )}
            <span className="small oneline">
              {event.title ?? 'Watch no longer listed'}
              <span className="muted">
                {[event.title ? formatPrice(event.priceCents, event.currency) : null, event.dealerName]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)
                  .join('')}
              </span>
            </span>
          </div>
        ) : event.dealerName ? (
          <p className="small">{event.dealerName}</p>
        ) : null}
        {notes.length ? <p className="timeline-note muted small">{notes.join(' · ')}</p> : null}
      </div>
    </li>
  );
}

function named(items: { name: string; count: number }[]): string {
  if (!items.length) return 'None';
  return items.map((item) => `${item.name} ${item.count}`).join(', ');
}
