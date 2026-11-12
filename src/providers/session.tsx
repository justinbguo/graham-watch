import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { createSessionFromUrl, humanizeAuthError, setAuthNotice } from '@/lib/auth';
import { DEMO_USER_ID, isDemo } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
  /** Demo mode has a user but no Supabase session, so this is not `!!session`. */
  isSignedIn: boolean;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (isDemo) {
      setIsLoading(false);
      return;
    }

    // The stored session, and the listener. They race. The listener's first
    // event is often null, and writing that null used to replace the session
    // `getSession` had just read — `isSignedIn` flipped off and the deck
    // painted Log in for someone who was signed in. A null that is not an
    // explicit sign-out leaves the session we already hold.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession((current) => (next || event === 'SIGNED_OUT' ? next : current));
      setIsLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Magic links and OAuth callbacks land here as a deep link.
  useEffect(() => {
    if (url) {
      createSessionFromUrl(url).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        if (message) setAuthNotice(message);
      });
    }
  }, [url]);

  // Strip the email-link query so a refresh does not spend the hash twice.
  // Verification itself is createSessionFromUrl, which also covers a native open.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const current = new URL(window.location.href);
    const tokenHash = current.searchParams.get('token_hash');
    const described = current.searchParams.get('error_description') || current.searchParams.get('error');
    if (!tokenHash && !described) return;
    const href = current.href;
    current.searchParams.delete('token_hash');
    current.searchParams.delete('type');
    current.searchParams.delete('error');
    current.searchParams.delete('error_description');
    window.history.replaceState(window.history.state, '', `${current.pathname}${current.search}${current.hash}`);
    if (described) {
      setAuthNotice(humanizeAuthError(described));
      router.push('/sign-in');
      return;
    }
    void createSessionFromUrl(href).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'That link has expired. Ask for a new code.';
      setAuthNotice(message);
      router.push('/sign-in');
    });
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        userId: isDemo ? DEMO_USER_ID : (session?.user.id ?? null),
        isLoading,
        isSignedIn: isDemo || Boolean(session),
      }}>
      {children}
    </SessionContext.Provider>
  );
}
