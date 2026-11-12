import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useSession } from '@/providers/session';

import { loadGuestSwipes, recordGuestPass, settleGuest, undoGuestPass } from './guest';
import type { GuestSwipe } from './guestLedger';

type GuestContextValue = {
  ready: boolean;
  /**
   * Sign-in is writing this device's judgments. Saved lists wait, so they
   * cannot cache an empty wishlist from the moment before the write lands.
   */
  settling: boolean;
  swipedIds: ReadonlySet<string>;
  savedIds: readonly string[];
  recordPass: (listingId: string) => Promise<void>;
  undoPass: (listingId: string) => Promise<void>;
};

const GuestContext = createContext<GuestContextValue | null>(null);

export function useGuest() {
  const value = use(GuestContext);
  if (!value) throw new Error('useGuest must be used inside <GuestProvider>');
  return value;
}

export function GuestProvider({ children }: PropsWithChildren) {
  const { isSignedIn, userId } = useSession();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [swipes, setSwipes] = useState<GuestSwipe[]>([]);
  const [settledUser, setSettledUser] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadGuestSwipes().then((stored) => {
      if (!live) return;
      setSwipes(stored);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setSettledUser(null);
      return;
    }
    if (!isSignedIn || !ready) return;
    let cancelled = false;
    settleGuest(userId)
      .then((settled) => {
        if (cancelled) return;
        if (settled) setSwipes([]);
        void queryClient.invalidateQueries({ queryKey: ['deck'] });
        void queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
        void queryClient.invalidateQueries({ queryKey: ['saved'] });
        void queryClient.invalidateQueries({ queryKey: ['passes'] });
      })
      .catch(() => {
        // Storage stays; the next signed-in launch settles again.
      })
      .finally(() => {
        if (!cancelled) setSettledUser(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, ready, queryClient]);

  const recordPass = useCallback(
    async (listingId: string) => {
      if (isSignedIn) return;
      setSwipes(await recordGuestPass(listingId));
    },
    [isSignedIn]
  );

  const undoPass = useCallback(
    async (listingId: string) => {
      if (isSignedIn) return;
      setSwipes(await undoGuestPass(listingId));
    },
    [isSignedIn]
  );

  const settling = Boolean(userId && isSignedIn && settledUser !== userId);

  const value = useMemo<GuestContextValue>(
    () => ({
      ready,
      settling,
      swipedIds: new Set(isSignedIn ? [] : swipes.map((swipe) => swipe.listingId)),
      savedIds: isSignedIn
        ? []
        : swipes.filter((swipe) => swipe.direction === 'right').map((swipe) => swipe.listingId),
      recordPass,
      undoPass,
    }),
    [ready, settling, swipes, isSignedIn, recordPass, undoPass]
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}
