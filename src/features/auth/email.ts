import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GOOGLE_SIGN_IN_ENABLED,
  isAppleSignInAvailable,
  sendEmailLink,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from '@/lib/auth';
import { isLocalInbox, waitForLatestCode } from '@/lib/devInbox';

export type SignInStage = 'email' | 'code';

function messageOf(error: unknown): string {
  if (error instanceof Error && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') {
    return '';
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function useSignIn() {
  const [stage, setStage] = useState<SignInStage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [readingInbox, setReadingInbox] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
    return () => {
      generation.current += 1;
    };
  }, []);

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
      await sendEmailLink(address);
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
  }, [email, run]);

  const submitCode = useCallback(() => {
    const address = email.trim();
    const token = code.trim();
    if (token.length !== 6) return;
    void run(() => verifyEmailCode(address, token));
  }, [code, email, run]);

  const backToEmail = useCallback(() => {
    generation.current += 1;
    setStage('email');
    setCode('');
    setError(null);
    setReadingInbox(false);
  }, []);

  return {
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
    sendCode,
    submitCode,
    backToEmail,
    signInWithApple: () => run(signInWithApple),
    signInWithGoogle: () => run(signInWithGoogle),
  };
}
