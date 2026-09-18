import { useState } from 'react';

import { MAILPIT, supabase, target } from './supabase';

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
      if (failed) {
        // "Signups not allowed for otp" is what the auth server says when the
        // address has no account and shouldCreateUser is false. Accurate and
        // useless: the reader's next move is a terminal command.
        if (/signups? not allowed/i.test(failed.message)) {
          throw new Error(
            `No account for ${email.trim()} yet. Run: npm run dealers -- operator ${email.trim()}`
          );
        }
        throw failed;
      }
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
            {/* shouldCreateUser is false, so typing an address here can never
                make an account. The grant command is the only way in. */}
            <p className="muted small">
              Not an operator yet? Run{' '}
              <code>npm run dealers -- operator &lt;email&gt;</code>, which creates
              the account if it needs to.
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
            {target.isLocal ? (
              <p className="muted small">
                Local stack:{' '}
                <a href={MAILPIT} target="_blank" rel="noreferrer">
                  read the code in Mailpit
                </a>
                .
              </p>
            ) : (
              // Not Mailpit: a hosted project sends auth codes through
              // Supabase's own mailer, which is a different path from the
              // RESEND_API_KEY the edge functions need.
              <p className="muted small">
                Sent to your real inbox. If nothing arrives, {target.host} is
                probably on Supabase's built-in mailer, which allows only a few
                an hour.
              </p>
            )}
          </>
        )}

        {error ? <p className="error">{error}</p> : null}
      </form>
    </main>
  );
}
