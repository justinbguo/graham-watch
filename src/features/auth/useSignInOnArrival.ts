import { useEffect } from 'react';
import { Platform } from 'react-native';

import { openSignIn } from '@/features/auth/guest';
import { useSession } from '@/providers/session';

let shown = false;

export function useSignInOnArrival(active: boolean) {
  const { isSignedIn, isLoading } = useSession();

  useEffect(() => {
    if (Platform.OS !== 'web' || !active || isLoading || isSignedIn || shown) return;
    shown = true;
    openSignIn('action');
  }, [active, isLoading, isSignedIn]);
}
