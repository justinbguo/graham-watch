import type { AttentionItem, AttentionKind } from './attention';
import type { Jump } from './navigation';
import type { Pulse } from './pulse';

const KIND: Record<AttentionKind, string> = {
  application: 'Application',
  unanswered: 'Unanswered 48h',
  quiet: 'Quiet 14d',
  refresh_missing: 'Refresh',
  refresh_failed: 'Refresh',
  refresh_dealer: 'Refresh',
  listing_photo: 'No photo',
  listing_stale: 'Stale check',
};

function jumpFor(item: AttentionItem): Jump {
  switch (item.kind) {
    case 'application':
      return { screen: 'applications' };
    case 'unanswered':
      return { screen: 'dealers', focus: { dealerId: item.dealerId ?? undefined, flag: 'unanswered' } };
    case 'quiet':
      return { screen: 'dealers', focus: { dealerId: item.dealerId ?? undefined, flag: 'quiet' } };
    case 'listing_photo':
      return {
        screen: 'dealers',
        focus: { dealerId: item.dealerId ?? undefined, flag: 'missing_photos', openListings: true },
      };
    case 'listing_stale':
      return { screen: 'dealers', focus: { dealerId: item.dealerId ?? undefined, openListings: true } };
    case 'refresh_dealer':
      return { screen: 'refresh', dealerId: item.dealerId ?? undefined };
    default:
      return { screen: 'refresh' };
  }
}

export function Attention({
  items,
  error,
  onJump,
  onReload,
}: {
  items: Pulse['items'] | null;
  error: string | null;
  onJump: (jump: Jump) => void;
  onReload: () => void;
}) {
  return (
    <section>
      <header className="bar">
        <h1>Needs attention</h1>
        <button className="ghost push" onClick={onReload}>
          Reload
        </button>
      </header>
      <p className="muted legend">
        A shop waiting on an answer, a buyer waiting on a reply, a dealer who has not signed in for 14 days,
        a nightly refresh that did not land, and a live watch with no photo or an availability check older
        than 48 hours.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">Nothing is waiting.</p>
      ) : (
        <ul className="rows attention">
          {items.map((item) => (
            <li key={item.id} className="row">
              <div className="grow">
                <span className="badge wait">{KIND[item.kind]}</span>
                <h2>{item.label}</h2>
                <p className="muted small">{item.detail}</p>
              </div>
              <button className="ghost" onClick={() => onJump(jumpFor(item))}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
