import type { EventInput, ListingRef } from '@/data/listingEventQueue';
import type { BuyerEventSurface, SwipeDirection } from '@/lib/models';

/**
 * What a signed-out device holds and what sign-in does with it. Pure, and
 * type-only in its imports, so node can load it with
 * --experimental-strip-types. `guest.ts` is the shell around it and the only
 * module that reads or writes the storage these parse.
 */

export const JUDGE_SURFACES = ['buy', 'new', 'detail'] as const satisfies readonly BuyerEventSurface[];
export type JudgeSurface = (typeof JUDGE_SURFACES)[number];

/**
 * One judgment kept on the device until there is an account. New writes are
 * passes. A `right` here was stored before saving asked for sign-in, and it
 * still settles as a save.
 */
export type GuestSwipe = { listingId: string; direction: SwipeDirection };

/** A guest's save waiting for an account. At most one per device, and the latest request wins. */
export type PendingSave = {
  /** The buyer_events id its `save` row uses. A replayed id inserts nothing. */
  eventId: string;
  listing: ListingRef;
  surface: JudgeSurface;
  /** Epoch ms of the gesture. The `save` row's occurred_at. */
  heldAt: number;
};

export type PendingCommand =
  | { type: 'place'; save: PendingSave }
  | { type: 'decline' }
  | { type: 'finish'; eventId: string };

export type JudgeAction = 'record' | 'ask';

/** The email link's life (`otp_expiry` in supabase/config.toml). The client cannot read the hosted value. */
export const PENDING_SAVE_TTL_MS = 60 * 60 * 1000;

export function judgeAction(signedIn: boolean, direction: SwipeDirection): JudgeAction {
  return !signedIn && direction === 'right' ? 'ask' : 'record';
}

/** The stored judgments. Anything that is not one reads as none. */
export function parseGuestSwipes(raw: string | null): GuestSwipe[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { swipes?: unknown } | null;
    if (!Array.isArray(parsed?.swipes)) return [];
    return parsed.swipes.flatMap((swipe: Partial<GuestSwipe> | null) =>
      typeof swipe?.listingId === 'string' && (swipe.direction === 'left' || swipe.direction === 'right')
        ? [{ listingId: swipe.listingId, direction: swipe.direction }]
        : [],
    );
  } catch {
    return [];
  }
}

/** The stored held save, or null when there is none, it is malformed, or it outlived the email link. */
export function parsePendingSave(raw: string | null, now: number): PendingSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingSave> | null;
    const listing = parsed?.listing;
    const surface = JUDGE_SURFACES.find((known) => known === parsed?.surface);
    if (
      typeof parsed?.eventId !== 'string' ||
      typeof listing?.id !== 'string' ||
      typeof listing.dealer_id !== 'string' ||
      !surface ||
      typeof parsed.heldAt !== 'number' ||
      !Number.isFinite(parsed.heldAt) ||
      now - parsed.heldAt > PENDING_SAVE_TTL_MS
    ) {
      return null;
    }
    return {
      eventId: parsed.eventId,
      listing: { id: listing.id, dealer_id: listing.dealer_id },
      surface,
      heldAt: parsed.heldAt,
    };
  } catch {
    return null;
  }
}

export type Settlement = {
  rows: GuestSwipe[];
  /** The held save's event, under the id and time of the gesture. A stored `right` has none. */
  save: { event: EventInput; at: { id: string; occurredAt: number } } | null;
};

/**
 * What sign-in writes. One row per watch, because Postgres refuses an upsert
 * that touches one key twice (21000). A watch passed in the deck and then
 * saved from its listing is one row, and the save wins.
 */
export function settlement(swipes: readonly GuestSwipe[], pending: PendingSave | null): Settlement {
  const byListing = new Map<string, SwipeDirection>();
  for (const swipe of swipes) {
    if (!byListing.has(swipe.listingId)) byListing.set(swipe.listingId, swipe.direction);
  }
  if (pending) byListing.set(pending.listing.id, 'right');
  return {
    rows: Array.from(byListing, ([listingId, direction]) => ({ listingId, direction })),
    save: pending
      ? {
          event: { kind: 'save', surface: pending.surface, listing: pending.listing },
          at: { id: pending.eventId, occurredAt: pending.heldAt },
        }
      : null,
  };
}

/**
 * `finish` clears the slot only while it still holds the save that settled,
 * so a newer request from another tab outlives an older settle.
 */
export function nextPending(current: PendingSave | null, command: PendingCommand): PendingSave | null {
  switch (command.type) {
    case 'place':
      return command.save;
    case 'decline':
      return null;
    case 'finish':
      return current?.eventId === command.eventId ? null : current;
  }
}
