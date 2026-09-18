import { useState } from 'react';

import { supabase, target } from './supabase';

/**
 * Email and password.
 *
 * The phone app uses one-time codes because a buyer should never have a
 * password to forget. An operator is one person with a terminal, and waiting on
 * a mail round trip to publish a shop is friction with nothing bought: a hosted
 * project sends auth codes through Supabase's own mailer, which allows only a
 * few an hour.
 *
 * The trade is real, though. A password can be guessed and a one-time code
 * cannot, and the auth endpoint is public. Hence the length floor the grant
 * command enforces.
 */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!failed) return;

      // The auth server says "Invalid login credentials" for a wrong password,
      // an unknown address and an account with no password set. The reader
      // cannot tell those apart, and the same command fixes all three.
      throw /invalid login credentials/i.test(failed.message)
        ? new Error(
            `Wrong address or password. Set one with:\nnpm run dealers -- operator ${
              email.trim() || '<email>'
            } --password "..."`
          )
        : failed;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <form
        className="panel narrow"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}>
        <div>
          <h1>Graham</h1>
          <p className="muted">
            Operator{' '}
            <span className={target.isLocal ? 'badge' : 'badge live'} title={target.url}>
              {target.isLocal ? 'local' : 'production'}
            </span>
          </p>
        </div>

        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button type="submit" disabled={busy || !email.includes('@') || password.length === 0}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted small">
          Operators are granted from the terminal, never from here:{' '}
          <code>npm run dealers -- operator &lt;email&gt; --password "..."</code>
        </p>

        {error ? <p className="error">{error}</p> : null}
      </form>
    </main>
  );
}
