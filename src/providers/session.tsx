import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import { createSessionFromUrl } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type SessionState = {
  session: Session | null;
  userId: string | null;
  isLoading: boolean;
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setIsLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // Magic links and OAuth callbacks land here as a deep link.
  useEffect(() => {
    if (url) createSessionFromUrl(url).catch(() => undefined);
  }, [url]);

  return (
    <SessionContext.Provider value={{ session, userId: session?.user.id ?? null, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}
