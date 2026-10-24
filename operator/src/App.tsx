import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { Activity } from './Activity';
import { AddShops } from './AddShops';
import { Applications } from './Applications';
import { Attention } from './Attention';
import { Dealers } from './Dealers';
import { Refresh } from './Refresh';
import { SignIn } from './SignIn';
import { Users } from './Users';
import type { DealerFocus, Jump, Screen } from './navigation';
import { usePulse } from './pulse';
import { supabase, target } from './supabase';

// Needs attention is first in the nav because the badge is the thing to see
// on the way in. Dealers stays the screen that opens: importing watches and
// publishing a shop both happen there.
const SCREENS = {
  attention: 'Needs attention',
  dealers: 'Dealers',
  refresh: 'Refresh',
  users: 'Users',
  activity: 'Activity',
  applications: 'Applications',
  add: 'Add shops',
} as const satisfies Record<Screen, string>;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // Keyed by user id, not a bare boolean. Signing out and back in as a
  // different account would otherwise show the last answer for one render, and
  // that render is the whole operator UI.
  const [access, setAccess] = useState<{ userId: string; ok: boolean } | null>(null);
  const [screen, setScreen] = useState<Screen>('dealers');
  const [dealerFocus, setDealerFocus] = useState<DealerFocus | null>(null);
  const [refreshDealerId, setRefreshDealerId] = useState<string | undefined>();
  // The previous account's answer stays in state until the new check returns.
  // Fetching in that gap would ask as the new session and trust the old grant.
  const operatorReady = Boolean(session && access?.userId === session.user.id && access.ok);
  const pulseState = usePulse(operatorReady, screen);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Asked once per session. Without it a non-operator would see empty lists and
  // buttons that fail, which reads as a broken app rather than a refusal.
  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    let live = true;
    void supabase.rpc('is_operator').then(({ data }) => {
      if (live) setAccess({ userId, ok: data === true });
    });
    return () => {
      live = false;
    };
  }, [session]);

  if (!ready) return <main className="centered"><p className="muted">Loading…</p></main>;
  if (!session) return <SignIn />;

  const checked = access?.userId === session.user.id ? access : null;

  if (!checked) {
    return <main className="centered"><p className="muted">Checking access…</p></main>;
  }

  if (!checked.ok) {
    return (
      <main className="centered">
        <div className="panel narrow">
          <h1>Not an operator</h1>
          <p className="muted">
            {session.user.email} is signed in but cannot approve shops. Grant it with:
          </p>
          <pre>npm run dealers -- operator {session.user.email}</pre>
          <button className="ghost" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </main>
    );
  }

  const waiting = pulseState.pulse?.items.length ?? 0;

  function go(jump: Jump) {
    if (jump.screen === 'dealers') setDealerFocus(jump.focus);
    if (jump.screen === 'refresh') setRefreshDealerId(jump.dealerId);
    setScreen(jump.screen);
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          Graham <span className="muted">Operator</span>
        </div>
        <span
          className={target.isLocal ? 'badge' : 'badge live'}
          title={target.url}>
          {target.isLocal ? 'local' : 'production'}
        </span>
        <nav className="tabs">
          {Object.entries(SCREENS).map(([key, label]) => (
            <button
              key={key}
              className={screen === key ? 'tab on' : 'tab'}
              onClick={() => setScreen(key as Screen)}>
              {label}
              {key === 'attention' && waiting > 0 ? (
                <span className="badge wait">{waiting}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="who">
          <span className="muted small">{session.user.email}</span>
          <button className="ghost" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="body">
        <button
          className={pulseState.pulse ? `health ${pulseState.pulse.banner.tone}` : 'health'}
          onClick={() => setScreen('refresh')}>
          <strong>{pulseState.pulse?.banner.title ?? 'Checking the last refresh…'}</strong>
          {pulseState.pulse ? <span className="muted">{pulseState.pulse.banner.detail}</span> : null}
        </button>
        {screen === 'attention' ? (
          <Attention
            items={pulseState.pulse?.items ?? null}
            error={pulseState.pulse?.error ?? null}
            onJump={go}
            onReload={pulseState.reload}
          />
        ) : screen === 'refresh' ? (
          <Refresh
            runs={pulseState.pulse?.runs ?? null}
            runsUnavailable={pulseState.pulse?.runsUnavailable ?? false}
            error={pulseState.pulse?.error ?? null}
            highlightDealerId={refreshDealerId}
            onOpenDealer={(dealerId) => go({ screen: 'dealers', focus: { dealerId, openListings: true } })}
            onReload={pulseState.reload}
          />
        ) : screen === 'applications' ? (
          <Applications />
        ) : screen === 'users' ? (
          <Users />
        ) : screen === 'activity' ? (
          <Activity />
        ) : screen === 'dealers' ? (
          <Dealers focus={dealerFocus} />
        ) : (
          // Lands on Dealers after a run, because the next two steps — importing
          // watches and publishing the shop — both live there.
          <AddShops onAdded={() => setScreen('dealers')} />
        )}
      </main>
    </div>
  );
}
