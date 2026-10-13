import { GUEST_SWIPE_BUDGET } from '@/lib/design';
import type { SwipeDirection } from '@/lib/models';
import { secureStorage } from '@/lib/secureStorage';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'graham.guest.swipes';

export type GuestSwipe = {
  listingId: string;
  direction: SwipeDirection;
};

export type GuestState = {
  swipes: GuestSwipe[];
};

export function guestBudgetLeft(swipes: GuestSwipe[]): number {
  return Math.max(0, GUEST_SWIPE_BUDGET - swipes.length);
}

export function guestSwipedIds(swipes: GuestSwipe[]): Set<string> {
  return new Set(swipes.map((swipe) => swipe.listingId));
}

export function guestSavedIds(swipes: GuestSwipe[]): string[] {
  return swipes.filter((swipe) => swipe.direction === 'right').map((swipe) => swipe.listingId);
}

export async function loadGuestState(): Promise<GuestState> {
  const raw = await secureStorage.getItem(STORAGE_KEY);
  if (!raw) return { swipes: [] };
  try {
    const parsed = JSON.parse(raw) as GuestState;
    if (!Array.isArray(parsed.swipes)) return { swipes: [] };
    return {
      swipes: parsed.swipes.filter(
        (swipe) =>
          typeof swipe?.listingId === 'string' &&
          (swipe.direction === 'left' || swipe.direction === 'right')
      ),
    };
  } catch {
    return { swipes: [] };
  }
}

export async function saveGuestState(state: GuestState): Promise<void> {
  if (state.swipes.length === 0) {
    await secureStorage.removeItem(STORAGE_KEY);
    return;
  }
  await secureStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearGuestState(): Promise<void> {
  await secureStorage.removeItem(STORAGE_KEY);
}

/**
 * Once there is an account, the local judgments become real rows. Failures are
 * left in storage so the next launch can try again rather than dropping saves.
 */
export async function flushGuestSwipes(actorId: string, swipes: GuestSwipe[]): Promise<void> {
  if (swipes.length === 0) return;

  const { error } = await supabase.from('swipes').upsert(
    swipes.map((swipe) => ({
      actor_id: actorId,
      listing_id: swipe.listingId,
      direction: swipe.direction,
    })),
    { onConflict: 'actor_id,listing_id' }
  );
  if (error) throw error;
  await clearGuestState();
}
