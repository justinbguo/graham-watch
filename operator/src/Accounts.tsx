import { useEffect, useMemo, useState } from 'react';

import {
  formatPacific,
  parseAccount,
  parseAccounts,
  type Account,
  type AccountDetail,
  type TimelineEvent,
} from './accounts';
import { labelAnswer } from './dashboard';
import { formatPrice, photoUrl } from './importer';
import { supabase } from './supabase';

export function Accounts({
  focusId = null,
  onFocusUsed,
}: {
  focusId?: string | null;
  onFocusUsed?: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<'number' | 'active'>('number');
  const [opened, setOpened] = useState<{ id: string; limit: number } | null>(null);
  const [loaded, setLoaded] = useState<{ id: string; detail: AccountDetail } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase.rpc('operator_accounts').then(({ data, error: failed }) => {
      if (!live) return;
      setError(failed?.message ?? null);
      setAccounts(parseAccounts(data));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!focusId) return;
    setDetailError(null);
    setOpened({ id: focusId, limit: 200 });
    onFocusUsed?.();
  }, [focusId, onFocusUsed]);

  useEffect(() => {
    if (!opened) return;
    const requested = opened;
    let live = true;
    void supabase
      .rpc('operator_account', { p_user_id: requested.id, p_limit: requested.limit })
      .then(({ data, error: failed }) => {
        if (!live) return;
        setDetailError(failed?.message ?? null);
        if (data) setLoaded({ id: requested.id, detail: parseAccount(data) });
      });
    return () => {
      live = false;
    };
  }, [opened]);

  const sorted = useMemo(() => {
    if (!accounts || order === 'number') return accounts ?? [];
    return [...accounts].sort(
      (a, b) => instant(b.lastActiveAt) - instant(a.lastActiveAt) || a.collectorNumber - b.collectorNumber,
    );
  }, [accounts, order]);

  const selected = opened ? accounts?.find((account) => account.id === opened.id) ?? null : null;
  const detail = opened && loaded?.id === opened.id ? loaded.detail : null;

  const open = (id: string) => {
    if (opened?.id === id) return;
    setDetailError(null);
    setOpened({ id, limit: 200 });
  };
  const showOlder = () => setOpened((current) => current && { ...current, limit: current.limit * 2 });

  return (
    <section className="inbox">
      <header className="toolbar">
        <h1>Accounts</h1>
        <span className="muted small">
          {accounts ? `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} · ` : ''}times in Pacific
        </span>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <div className="inbox-split accounts-split">
        <aside className="inbox-rail accounts-rail" aria-label="Accounts">
          <div className="inbox-rail-head">
            <div className="tabs inbox-mode-tabs">
              <button className={order === 'number' ? 'tab on' : 'tab'} type="button" onClick={() => setOrder('number')}>
                Number
              </button>
              <button className={order === 'active' ? 'tab on' : 'tab'} type="button" onClick={() => setOrder('active')}>
                Last active
              </button>
            </div>
          </div>

          <div className="inbox-rail-list">
            {accounts === null ? (
              <p className="muted inbox-rail-empty">Loading…</p>
            ) : sorted.length === 0 ? (
              <p className="muted inbox-rail-empty">No accounts yet.</p>
            ) : (
              <ul className="inbox-conv-list">
                {sorted.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      className={opened?.id === account.id ? 'inbox-conv on' : 'inbox-conv'}
                      onClick={() => open(account.id)}>
                      <span className="inbox-conv-copy">
                        <span className="inbox-conv-line">
                          <strong className="inbox-conv-name">
                            #{account.collectorNumber} {account.name}
                          </strong>
                          <span className="inbox-conv-when">{lastActive(account)}</span>
                        </span>
                        <span className="inbox-conv-line">
                          <span className="muted small oneline">{account.email ?? 'No email'}</span>
                          <span className="inbox-conv-when">Joined {formatPacific(account.signedUpAt, 'date')}</span>
                        </span>
                        <span className="muted small">{countLine(account)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="inbox-pane">
          {!selected ? (
            <div className="inbox-pane-empty">
              <p className="muted">Pick an account to read its timeline.</p>
            </div>
          ) : (
            <AccountPane account={selected} detail={detail} error={detailError} onShowOlder={showOlder} />
          )}
        </div>
      </div>
    </section>
  );
}

function AccountPane({
  account,
  detail,
  error,
  onShowOlder,
}: {
  account: Account;
  detail: AccountDetail | null;
  error: string | null;
  onShowOlder: () => void;
}) {
  const sub = [
    account.email ?? 'No email',
    account.handle ? `@${account.handle}` : null,
    account.accountType ? labelAnswer(account.accountType) : null,
    `joined ${formatPacific(account.signedUpAt, 'dateTime')}`,
    `last active ${account.lastActiveAt ? formatPacific(account.lastActiveAt, 'dateTime') : 'never'}`,
  ].filter(Boolean);

  return (
    <>
      <header className="inbox-pane-head">
        <div>
          <h2 className="inbox-pane-title">
            Collector #{account.collectorNumber} · {account.name}
          </h2>
          <p className="muted small inbox-pane-sub">{sub.join(' · ')}</p>
        </div>
      </header>

      <div className="accounts-pane-body">
        <div className="stats">
          <Stat label="Right" value={account.counts.right} />
          <Stat label="Left" value={account.counts.left} />
          <Stat label="Clicks" value={account.counts.clicks} />
          <Stat label="Follows" value={account.counts.follows} />
        </div>

        {error ? <p className="error">{error}</p> : null}

        {!detail ? (
          error ? null : <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="cols">
              <TasteBlock taste={detail.taste} />
              <OnboardingBlock onboarding={detail.onboarding} />
            </div>

            <div className="block">
              <h2>Timeline</h2>
              {detail.days.length === 0 ? (
                <p className="muted small">Nothing logged yet.</p>
              ) : (
                <ol className="timeline">
                  {detail.days.map((day) => (
                    <li key={day.key}>
                      <h3 className="timeline-day">{day.label}</h3>
                      <ol className="timeline">
                        {day.events.map((event) => (
                          <TimelineRow key={event.id} event={event} />
                        ))}
                      </ol>
                    </li>
                  ))}
                </ol>
              )}
              <footer className="toolbar-end">
                <span className="muted small">
                  Showing {detail.shown} of {detail.total} events.
                </span>
                {detail.more ? (
                  <button className="ghost" type="button" onClick={onShowOlder}>
                    Show older
                  </button>
                ) : null}
              </footer>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function TasteBlock({ taste }: { taste: AccountDetail['taste'] }) {
  return (
    <div>
      <h3 className="small">Taste</h3>
      <Answer label="Brands" values={taste.brands.map((brand) => `${brand.value} ${brand.count}`)} />
      <Answer label="Shops" values={taste.shops.map((shop) => `${shop.value} ${shop.count}`)} />
      <Answer
        label="Price"
        values={
          taste.price
            ? [
                `${formatPrice(taste.price.minCents, taste.price.currency)} to ${formatPrice(taste.price.maxCents, taste.price.currency)} across ${taste.price.count} ${taste.price.count === 1 ? 'watch' : 'watches'}`,
              ]
            : []
        }
      />
      <Answer label="Follows" values={taste.following} />
      <p className="muted small">
        From {taste.positive} {taste.positive === 1 ? 'watch' : 'watches'} still saved, clicked through, or asked about.
      </p>
    </div>
  );
}

function OnboardingBlock({ onboarding }: { onboarding: AccountDetail['onboarding'] }) {
  return (
    <div>
      <h3 className="small">Onboarding</h3>
      {onboarding.onboardedAt ? null : <p className="muted small">Not finished.</p>}
      <Answer label="Favourite brands" values={onboarding.favoriteBrands} />
      <Answer label="Hunting for" values={onboarding.huntingFor.map(labelAnswer)} />
      <Answer label="Collection" values={onboarding.collectionSize ? [labelAnswer(onboarding.collectionSize)] : []} />
      <Answer label="Years collecting" values={onboarding.collectingYears ? [labelAnswer(onboarding.collectingYears)] : []} />
      <Answer label="Search is hard because" values={onboarding.searchPainPoints.map(labelAnswer)} />
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const { subject } = event;
  return (
    <li className="timeline-row">
      <span className="timeline-time muted small">{event.time}</span>
      <div className="min-0">
        <p className="small">
          <strong>{event.label}</strong>
          {event.where ? <span className="muted"> · {event.where}</span> : null}
          {event.beforeSignIn ? <span className="muted"> · before sign-in</span> : null}
        </p>
        {subject?.type === 'watch' ? (
          <div className="timeline-subject">
            <WatchThumb path={subject.thumbPath} sourceUrl={subject.thumbSourceUrl} />
            <span className="small oneline">
              {subject.title ?? 'Watch no longer listed'}
              <span className="muted">
                {[subject.title ? formatPrice(subject.priceCents, subject.currency) : null, subject.shopName]
                  .filter(Boolean)
                  .map((part) => ` · ${part}`)
                  .join('')}
              </span>
            </span>
          </div>
        ) : subject?.type === 'shop' ? (
          <p className="small">{subject.name ?? 'Shop no longer listed'}</p>
        ) : null}
        {event.note ? <p className="timeline-note muted small">{event.note}</p> : null}
      </div>
    </li>
  );
}

function WatchThumb({ path, sourceUrl }: { path: string | null; sourceUrl: string | null }) {
  const src = path ? photoUrl(path) : sourceUrl;
  return src ? (
    <img className="timeline-thumb" src={src} alt="" loading="lazy" />
  ) : (
    <span className="timeline-thumb thumb-gap" aria-hidden="true" />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Answer({ label, values }: { label: string; values: string[] }) {
  return (
    <p className="small">
      <span className="muted">{label}</span>
      <br />
      {values.length ? values.join(', ') : '—'}
    </p>
  );
}

function lastActive(account: Account): string {
  return account.lastActiveAt ? formatPacific(account.lastActiveAt, 'dateTime') : 'Never';
}

function countLine({ counts }: Account): string {
  return `${counts.right} right · ${counts.left} left · ${counts.clicks} clicks · ${counts.follows} follows`;
}

function instant(iso: string | null): number {
  const time = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}
