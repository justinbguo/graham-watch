import { useState } from 'react';

import { isLocal, MAILPIT, supabase } from './supabase';

type Stage = 'email' | 'code';

/**
 * Email codes, the same way the phone app signs in. No passwords, so granting
 * operator access to a real address needs nothing set up beyond having signed
 * in once.
 */
export function SignIn() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      const { error: failed } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (failed) throw failed;
      setStage('code');
      setCode('');
    });

  const verify = () =>
    run(async () => {
      const { error: failed } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (failed) throw failed;
    });

  return (
    <main className="centered">
      <form
        className="panel narrow"
        onSubmit={(event) => {
          event.preventDefault();
          if (stage === 'email') send();
          else verify();
        }}>
        <div>
          <h1>Graham</h1>
          <p className="muted">Operator</p>
        </div>

        {stage === 'email' ? (
          <>
            <label>
              Your email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button type="submit" disabled={busy || !email.includes('@')}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
            {/* shouldCreateUser is false, so an address with no account is
                rejected rather than silently signed up as a new operator. */}
            <p className="muted small">
              The address has to have an account already. Grant it with{' '}
              <code>npm run dealers -- operator &lt;email&gt;</code>.
            </p>
          </>
        ) : (
          <>
            <label>
              Six digit code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
              />
            </label>
            <button type="submit" disabled={busy || code.trim().length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="ghost" onClick={() => setStage('email')}>
              Back
            </button>
            {isLocal() ? (
              <p className="muted small">
                Local stack:{' '}
                <a href={MAILPIT} target="_blank" rel="noreferrer">
                  read the code in Mailpit
                </a>
                .
              </p>
            ) : null}
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
      </form>
    </main>
  );
}
