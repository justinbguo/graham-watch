import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GOOGLE_SIGN_IN_ENABLED,
  callbackFailure,
  isAppleSignInAvailable,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  signInWithProvider,
  verifyEmailCode,
} from '@/lib/auth';
import { isLocalInbox, waitForLatestCode } from '@/lib/devInbox';

/** Create is the default: the screen exists for people who are not in yet. */
export type SignInMode = 'create' | 'login';
export type SignInStage = 'method' | 'email' | 'code';

function messageOf(error: unknown): string {
  if (error instanceof Error && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
    return '';
  }
  const text = error instanceof Error ? error.message : 'Something went wrong.';
  // iOS reports a dead TCP connection as a fetch exception from Expo's native
  // promise. The usual cause is the phone calling 127.0.0.1, which is itself.
  if (/could not connect|network request failed|failed to connect/i.test(text)) {
    return 'Could not reach the database on this Mac. Stay on the same Wi-Fi and reload the app.';
  }
  return text;
}

export function useSignIn() {
  const [mode, setMode] = useState<SignInMode>('create');
  const [stage, setStage] = useState<SignInStage>('method');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [readingInbox, setReadingInbox] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const generation = useRef(0);
  const incoming = Linking.useLinkingURL();

  useEffect(() => {
    isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
    return () => {
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!incoming) return;
    const failed = callbackFailure(incoming);
    if (failed) setError(failed);
  }, [incoming]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (caught) {
      const text = messageOf(caught);
      if (text) setError(text);
    } finally {
      setBusy(false);
      setReadingInbox(false);
    }
  }, []);

  const sendCode = useCallback(() => {
    const address = email.trim();
    if (!address.includes('@')) return;
    void run(async () => {
      const mine = ++generation.current;
      const since = Date.now();
      await sendEmailCode(address, { createAccount: mode === 'create' });
      if (mine !== generation.current) return;
      setStage('code');
      setCode('');
      if (!isLocalInbox()) return;
      setReadingInbox(true);
      const token = await waitForLatestCode(address, since);
      if (mine !== generation.current) return;
      if (!token) return;
      setCode(token);
      await verifyEmailCode(address, token);
    });
  }, [email, mode, run]);

  const submitCode = useCallback(() => {
    const address = email.trim();
    const token = code.trim();
    if (token.length !== 6) return;
    void run(() => verifyEmailCode(address, token));
  }, [code, email, run]);

  const chooseEmail = useCallback(() => {
    setError(null);
    setStage('email');
  }, []);

  /** One step back. A code in flight is abandoned, not verified late. */
  const back = useCallback(() => {
    generation.current += 1;
    setCode('');
    setError(null);
    setReadingInbox(false);
    setStage((current) => (current === 'code' ? 'email' : 'method'));
  }, []);

  // The typed address survives the switch: the usual reason to flip is
  // "that address has no account", and retyping it is the wrong answer.
  const switchMode = useCallback(() => {
    setError(null);
    setMode((current) => (current === 'create' ? 'login' : 'create'));
  }, []);

  return {
    mode,
    stage,
    email,
    setEmail,
    code,
    setCode,
    busy,
    readingInbox,
    error,
    appleAvailable,
    googleEnabled: GOOGLE_SIGN_IN_ENABLED,
    chooseEmail,
    sendCode,
    submitCode,
    back,
    switchMode,
    signInWithApple: () => run(signInWithApple),
    signInWithAppleWeb: () => run(() => signInWithProvider('apple')),
    signInWithGoogle: () => run(signInWithGoogle),
  };
}
