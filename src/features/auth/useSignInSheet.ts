import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/providers/session';

import { abandonPendingSave, declinePendingSave, type SignInReason } from './guest';

/**
 * The sign-in sheet's reason, and what closing it means for a held save.
 * Close, Not now, the scrim, and Escape drop the save. Browser back does too,
 * unless this document is unloading: the email link replaces the page, and
 * the next one still needs the watch. Sign-in itself calls `router.back`
 * with a stored session, which leaves the hold for settle.
 */
export function useSignInSheet(): { reason: SignInReason; dismiss: () => void } {
  const { isSignedIn } = useSession();
  const param = useLocalSearchParams<{ reason?: string }>().reason;
  const reason: SignInReason = param === 'save' ? 'save' : 'action';

  useEffect(() => {
    if (isSignedIn) router.back();
  }, [isSignedIn]);

  useEffect(() => {
    if (reason !== 'save' || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    let unloading = false;
    const markUnloading = () => {
      unloading = true;
    };
    const onPop = () => {
      if (!unloading) abandonPendingSave();
    };
    window.addEventListener('beforeunload', markUnloading);
    window.addEventListener('pagehide', markUnloading);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('beforeunload', markUnloading);
      window.removeEventListener('pagehide', markUnloading);
      window.removeEventListener('popstate', onPop);
    };
  }, [reason]);

  return {
    reason,
    dismiss: () => {
      if (reason === 'save') declinePendingSave();
      router.back();
    },
  };
}
