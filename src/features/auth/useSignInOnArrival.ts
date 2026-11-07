import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useGuest } from '@/features/auth/GuestProvider';
import { useSession } from '@/providers/session';

// Module scope, not state: once per page load. Dismissing and coming back to
// Buy should not reopen it; the swipe budget asks again.
let shown = false;

/** Web guests meet the sign-in sheet over the deck the moment Buy is on top. */
export function useSignInOnArrival(active: boolean) {
  const { isSignedIn, isLoading } = useSession();
  const { openSignIn } = useGuest();

  useEffect(() => {
    if (Platform.OS !== 'web' || !active || isLoading || isSignedIn || shown) return;
    shown = true;
    openSignIn('action');
  }, [active, isLoading, isSignedIn, openSignIn]);
}
