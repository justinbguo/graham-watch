import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/providers/session';

import { abandonPendingSave, type SignInReason } from './guest';

/**
 * The sign-in sheet's reason, its close on sign-in, and what closing it means.
 * Close, Not now, the scrim, Escape, and either back unmount the route. A page
 * unload does not, so a reload, the email link, and a web OAuth redirect keep
 * a held save.
 */
export function useSignInSheet(): { reason: SignInReason; dismiss: () => void } {
  const { isSignedIn } = useSession();
  const param = useLocalSearchParams<{ reason?: string }>().reason;
  const reason: SignInReason = param === 'save' ? 'save' : 'action';

  useEffect(() => {
    if (isSignedIn) router.back();
  }, [isSignedIn]);

  // The cleanup reads the stored session, not `isSignedIn`. On a phone a new
  // account unmounts the app for onboarding in the same commit that signs in.
  useEffect(() => (reason === 'save' ? abandonPendingSave : undefined), [reason]);

  return { reason, dismiss: () => router.back() };
}
