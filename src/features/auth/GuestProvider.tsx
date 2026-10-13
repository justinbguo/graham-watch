import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { GUEST_SWIPE_BUDGET } from '@/lib/design';
import type { SwipeDirection } from '@/lib/models';
import { useSession } from '@/providers/session';

import {
  clearGuestState,
  flushGuestSwipes,
  guestBudgetLeft,
  guestSavedIds,
  guestSwipedIds,
  loadGuestState,
  saveGuestState,
  type GuestSwipe,
} from './guest';

type GuestContextValue = {
  ready: boolean;
  swipes: GuestSwipe[];
  swipedIds: Set<string>;
  savedIds: string[];
  remaining: number;
  exhausted: boolean;
  recordSwipe: (listingId: string, direction: SwipeDirection) => Promise<void>;
  undoPass: (listingId: string) => Promise<void>;
  openSignIn: (reason?: 'budget' | 'action') => void;
};

const GuestContext = createContext<GuestContextValue | null>(null);

export function useGuest() {
  const value = use(GuestContext);
  if (!value) throw new Error('useGuest must be used inside <GuestProvider>');
  return value;
}

/**
 * Local swipe budget for people who have not signed in yet. The catalogue is
 * readable anonymously; judgments live on the device until an account exists,
 * then flush into `swipes`. Ten judgments is enough to feel the deck and not
 * enough to build a wishlist without an identity.
 */
export function GuestProvider({ children }: PropsWithChildren) {
  const { isSignedIn, userId } = useSession();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [swipes, setSwipes] = useState<GuestSwipe[]>([]);

  useEffect(() => {
    let live = true;
    loadGuestState().then((state) => {
      if (!live) return;
      setSwipes(state.swipes);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!isSignedIn || !userId || !ready) return;
    let cancelled = false;
    void (async () => {
      const stored = await loadGuestState();
      if (cancelled || stored.swipes.length === 0) return;
      try {
        await flushGuestSwipes(userId, stored.swipes);
        if (cancelled) return;
        setSwipes([]);
        // The deck and wishlist now live on the server for this account.
        void queryClient.invalidateQueries({ queryKey: ['deck'] });
        void queryClient.invalidateQueries({ queryKey: ['listing-counts'] });
        void queryClient.invalidateQueries({ queryKey: ['saved'] });
        void queryClient.invalidateQueries({ queryKey: ['passes'] });
      } catch {
        // Leave storage alone; the next signed-in launch retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, ready, queryClient]);

  const persist = useCallback(async (next: GuestSwipe[]) => {
    setSwipes(next);
    await saveGuestState({ swipes: next });
  }, []);

  const recordSwipe = useCallback(
    async (listingId: string, direction: SwipeDirection) => {
      if (isSignedIn) return;
      if (swipes.length >= GUEST_SWIPE_BUDGET) {
        throw new Error('Sign in to keep swiping.');
      }
      if (swipes.some((swipe) => swipe.listingId === listingId)) return;
      await persist([...swipes, { listingId, direction }]);
    },
    [isSignedIn, persist, swipes]
  );

  const undoPass = useCallback(
    async (listingId: string) => {
      if (isSignedIn) return;
      await persist(swipes.filter((swipe) => swipe.listingId !== listingId));
    },
    [isSignedIn, persist, swipes]
  );

  const openSignIn = useCallback((reason: 'budget' | 'action' = 'action') => {
    router.push({ pathname: '/sign-in', params: { reason } });
  }, []);

  const value = useMemo<GuestContextValue>(
    () => ({
      ready,
      swipes: isSignedIn ? [] : swipes,
      swipedIds: isSignedIn ? new Set() : guestSwipedIds(swipes),
      savedIds: isSignedIn ? [] : guestSavedIds(swipes),
      remaining: isSignedIn ? GUEST_SWIPE_BUDGET : guestBudgetLeft(swipes),
      exhausted: !isSignedIn && guestBudgetLeft(swipes) === 0,
      recordSwipe,
      undoPass,
      openSignIn,
    }),
    [ready, swipes, isSignedIn, recordSwipe, undoPass, openSignIn]
  );

  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export async function discardGuestState() {
  await clearGuestState();
}
