import type { EventInput, ListingRef } from '@/data/listingEventQueue';
import type { BuyerEventSurface, SwipeDirection } from '@/lib/models';

export const JUDGE_SURFACES = ['buy', 'new', 'detail'] as const satisfies readonly BuyerEventSurface[];
export type JudgeSurface = (typeof JUDGE_SURFACES)[number];

export type GuestSwipe = { listingId: string; direction: SwipeDirection };

export type PendingSave = {
  eventId: string;
  listing: ListingRef;
  surface: JudgeSurface;
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
