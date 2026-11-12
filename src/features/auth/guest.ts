import { router } from 'expo-router';

import { logEvent, newEventId, type ListingRef } from '@/data/listingEvents';
import { secureStorage } from '@/lib/secureStorage';
import { supabase } from '@/lib/supabase';

import {
  nextPending,
  parseGuestSwipes,
  parsePendingSave,
  settlement,
  type GuestSwipe,
  type JudgeSurface,
  type PendingCommand,
} from './guestLedger';

const SWIPES_KEY = 'graham.guest.swipes';
const PENDING_KEY = 'graham.guest.pending-save';

export type SignInReason = 'action' | 'save';

let writes: Promise<unknown> = Promise.resolve();

export function openSignIn(reason: SignInReason = 'action'): void {
  router.push({ pathname: '/sign-in', params: { reason } });
}

export async function loadGuestSwipes(): Promise<GuestSwipe[]> {
  return parseGuestSwipes(await secureStorage.getItem(SWIPES_KEY));
}

/** Passes are the only judgment a guest writes. Returns what is stored now. */
export function recordGuestPass(listingId: string): Promise<GuestSwipe[]> {
  return serial(async () => {
    const swipes = await loadGuestSwipes();
    if (swipes.some((swipe) => swipe.listingId === listingId)) return swipes;
    const next: GuestSwipe[] = [...swipes, { listingId, direction: 'left' }];
    await saveGuestSwipes(next);
    return next;
  });
}

export function undoGuestPass(listingId: string): Promise<GuestSwipe[]> {
  return serial(async () => {
    const next = (await loadGuestSwipes()).filter((swipe) => swipe.listingId !== listingId);
    await saveGuestSwipes(next);
    return next;
  });
}

/**
 * Holds the save, then opens the sheet. The write finishes before the route
 * push, so a reload of the sheet still has the watch.
 */
export async function askToSave(listing: ListingRef, surface: JudgeSurface): Promise<void> {
  const save = {
    eventId: newEventId(),
    listing: { id: listing.id, dealer_id: listing.dealer_id },
    surface,
    heldAt: Date.now(),
  };
  await serial(() => applyPending({ type: 'place', save }));
  openSignIn('save');
}

/** The visitor closed the sheet. The held save goes, session or not. */
export function declinePendingSave(): void {
  void serial(() => applyPending({ type: 'decline' }));
}

/**
 * The sheet left without a button. A stored session means sign-in, and the
 * hold stays for settle. No session means the route was dismissed.
 */
export function abandonPendingSave(): void {
  void serial(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) await applyPending({ type: 'decline' });
  });
}

/**
 * Turns what this device holds into the account's rows. Safe to run twice, in
 * two tabs, or after a crash at any line: the upsert repeats as a no-op, the
 * replayed event id inserts nothing, and `finish` leaves a newer hold alone.
 * A throw leaves storage for the next signed-in launch. True when anything
 * was written.
 */
export function settleGuest(userId: string): Promise<boolean> {
  // One turn of the write queue, including the read. A save that was just
  // asked for is already queued ahead of this, and a pass cannot land between
  // the read and the clear.
  return serial(async () => {
    const swipes = await loadGuestSwipes();
    const rawPending = await secureStorage.getItem(PENDING_KEY);
    const pending = parsePendingSave(rawPending, Date.now());
    if (rawPending && !pending) await secureStorage.removeItem(PENDING_KEY);
    const { rows, save } = settlement(swipes, pending);
    if (!rows.length) return false;

    const { error } = await supabase.from('swipes').upsert(
      rows.map((row) => ({ actor_id: userId, listing_id: row.listingId, direction: row.direction })),
      { onConflict: 'actor_id,listing_id' },
    );
    if (error) throw error;

    if (save) logEvent(save.event, save.at);
    await secureStorage.removeItem(SWIPES_KEY);
    if (pending) await applyPending({ type: 'finish', eventId: pending.eventId });
    return true;
  });
}

/**
 * Guest storage writes run one at a time, in call order. A SecureStore write
 * is several native calls, so a quick dismissal on Android could otherwise
 * land before the hold it undoes.
 */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = writes.then(task);
  writes = run.catch(() => undefined);
  return run;
}

async function applyPending(command: PendingCommand): Promise<void> {
  const current = parsePendingSave(await secureStorage.getItem(PENDING_KEY), Date.now());
  const next = nextPending(current, command);
  if (!next) await secureStorage.removeItem(PENDING_KEY);
  else if (next !== current) await secureStorage.setItem(PENDING_KEY, JSON.stringify(next));
}

async function saveGuestSwipes(swipes: GuestSwipe[]): Promise<void> {
  if (swipes.length === 0) {
    await secureStorage.removeItem(SWIPES_KEY);
    return;
  }
  await secureStorage.setItem(SWIPES_KEY, JSON.stringify({ swipes }));
}
