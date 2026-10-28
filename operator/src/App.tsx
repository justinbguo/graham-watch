import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { Activity } from './Activity';
import { AddShops } from './AddShops';
import { Applications } from './Applications';
import { Dealers } from './Dealers';
import { Inbox, type InboxFocus } from './Inbox';
import { SignIn } from './SignIn';
import { Users } from './Users';
import { supabase, target } from './supabase';

// Dealers first, because that is the screen an operator opens the console to
// use: importing watches and publishing a shop both happen there. Users is the
// activity dashboard. Applications is a queue that is empty most days.
const SCREENS = {
  dealers: 'Dealers',
  inbox: 'Inbox',
  users: 'Users',
  activity: 'Activity',
  applications: 'Applications',
  add: 'Add shops',
} as const;

type Screen = keyof typeof SCREENS;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // Keyed by user id, not a bare boolean. Signing out and back in as a
  // different account would otherwise show the last answer for one render, and
  // that render is the whole operator UI.
  const [access, setAccess] = useState<{ userId: string; ok: boolean } | null>(null);
  const [screen, setScreen] = useState<Screen>('dealers');
  const [inboxFocus, setInboxFocus] = useState<InboxFocus | null>(null);

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
          <button className="ghost compact" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </main>
    );
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
            </button>
          ))}
        </nav>
        <div className="who">
          <span className="muted small">{session.user.email}</span>
          <button className="ghost compact" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="body">
        {screen === 'applications' ? (
          <Applications />
        ) : screen === 'users' ? (
          <Users />
        ) : screen === 'activity' ? (
          <Activity />
        ) : screen === 'dealers' ? (
          <Dealers
            onOpenInbox={(dealer) => {
              setInboxFocus({ dealerId: dealer.id, dealerName: dealer.name });
              setScreen('inbox');
            }}
          />
        ) : screen === 'inbox' ? (
          <Inbox focus={inboxFocus} onClearFocus={() => setInboxFocus(null)} />
        ) : (
          // Lands on Dealers after a run, because the next two steps — importing
          // watches and publishing the shop — both live there.
          <AddShops onAdded={() => setScreen('dealers')} />
        )}
      </main>
    </div>
  );
}
