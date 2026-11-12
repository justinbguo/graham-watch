import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  GOOGLE_SIGN_IN_ENABLED,
  callbackFailure,
  emailOtpResendCooldownMs,
  humanizeAuthError,
  isAppleSignInAvailable,
  retryAfterSeconds,
  sendEmailCode,
  sendEmailCodeAdaptive,
  signInWithApple,
  signInWithGoogle,
  signInWithProvider,
  subscribeAuthNotice,
  takeAuthNotice,
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
  return humanizeAuthError(text);
}

const SIGN_IN_KEY = 'graham.sign-in';

function cooldownMs(): number {
  return isLocalInbox() ? 2_000 : emailOtpResendCooldownMs;
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
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const sending = useRef(false);
  const incoming = Linking.useLinkingURL();

  useEffect(() => {
    const showNotice = () => {
      const notice = takeAuthNotice();
      if (notice) setError(notice);
    };
    showNotice();
    const unsubscribe = subscribeAuthNotice(showNotice);
    isAppleSignInAvailable()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
    if (Platform.OS === 'web') {
      const raw = window.sessionStorage.getItem(SIGN_IN_KEY);
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { stage?: SignInStage; email?: string; sentAt?: number | null };
          if (saved.email) setEmail(saved.email);
          if (saved.stage === 'email' || saved.stage === 'code') setStage(saved.stage);
          if (typeof saved.sentAt === 'number') setSentAt(saved.sentAt);
        } catch {
          window.sessionStorage.removeItem(SIGN_IN_KEY);
        }
      }
    }
    return () => {
      unsubscribe();
      generation.current += 1;
    };
  }, []);

  useEffect(() => {
    if (sentAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sentAt]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (stage === 'method') {
      window.sessionStorage.removeItem(SIGN_IN_KEY);
      return;
    }
    window.sessionStorage.setItem(SIGN_IN_KEY, JSON.stringify({ stage, email, sentAt }));
  }, [stage, email, sentAt]);

  useEffect(() => {
    if (!incoming) return;
    const failed = callbackFailure(incoming);
    if (failed) setError(humanizeAuthError(failed));
  }, [incoming]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (caught) {
      const text = messageOf(caught);
      if (text) setError(text);
      const wait = retryAfterSeconds(text);
      if (wait != null) setSentAt(Date.now() - cooldownMs() + wait * 1000);
    } finally {
      setBusy(false);
      setReadingInbox(false);
      sending.current = false;
    }
  }, []);

  const resendIn = sentAt == null ? 0 : Math.max(0, Math.ceil((cooldownMs() - (now - sentAt)) / 1000));

  const deliver = useCallback(() => {
    const address = email.trim();
    if (!address.includes('@') || sending.current) return;
    if (sentAt !== null && Date.now() - sentAt < cooldownMs()) {
      setStage('code');
      setError('We already sent a code. Check your email, or wait for the timer before asking for another.');
      return;
    }
    sending.current = true;
    void run(async () => {
      const mine = ++generation.current;
      const since = Date.now();
      if (Platform.OS === 'web') {
        await sendEmailCodeAdaptive(address);
      } else {
        await sendEmailCode(address, { createAccount: mode === 'create' });
      }
      setSentAt(Date.now());
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
  }, [email, mode, run, sentAt]);

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
    resendIn,
    appleAvailable,
    googleEnabled: GOOGLE_SIGN_IN_ENABLED,
    chooseEmail,
    sendCode: deliver,
    submitCode,
    back,
    switchMode,
    signInWithApple: () => run(signInWithApple),
    signInWithAppleWeb: () => run(() => signInWithProvider('apple')),
    signInWithGoogle: () => run(signInWithGoogle),
  };
}
