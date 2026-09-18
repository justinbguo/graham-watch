import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { Applications } from './Applications';
import { Dealers } from './Dealers';
import { SignIn } from './SignIn';
import { supabase, target } from './supabase';

type Screen = 'applications' | 'dealers';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // Keyed by user id, not a bare boolean. Signing out and back in as a
  // different account would otherwise show the last answer for one render, and
  // that render is the whole operator UI.
  const [access, setAccess] = useState<{ userId: string; ok: boolean } | null>(null);
  const [screen, setScreen] = useState<Screen>('applications');

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
          <button
            className={screen === 'applications' ? 'tab on' : 'tab'}
            onClick={() => setScreen('applications')}>
            Applications
          </button>
          <button
            className={screen === 'dealers' ? 'tab on' : 'tab'}
            onClick={() => setScreen('dealers')}>
            Dealers
          </button>
        </nav>
        <div className="who">
          <span className="muted small">{session.user.email}</span>
          <button className="ghost" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="body">
        {screen === 'applications' ? <Applications /> : <Dealers />}
      </main>
    </div>
  );
}
