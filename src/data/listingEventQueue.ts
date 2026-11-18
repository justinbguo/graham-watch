import type { FilterSpec } from '@/features/filters/spec';
import type { Database } from '@/lib/database';
import { WIDE_BREAKPOINT } from '../lib/design.ts';
import type { BuyerEventSurface, DeckCard } from '@/lib/models';

/**
 * The buyer event log's rows and every decision about them: what a row holds,
 * which rows wait, merge, go, or drop, and what a failed send means. Pure.
 * Node loads it with --experimental-strip-types. `listingEvents.ts` is the
 * shell around it, and the only one of the two that screens import.
 */

export type ListingRef = Pick<DeckCard, 'id' | 'dealer_id'>;
export type DealerRef = { id: string };

type ListingAction = 'save' | 'pass' | 'unsave' | 'undo' | 'dealer_click' | 'inquiry_open';

/** What a gesture reports. Impressions and dwells come only from an `Exposure`. */
export type EventInput =
  | { kind: ListingAction; surface: BuyerEventSurface; listing: ListingRef }
  | { kind: 'follow' | 'unfollow'; surface: BuyerEventSurface; dealer: DealerRef }
  | { kind: 'filter'; surface: 'buy' | 'search'; filter: FilterSpec }
  | { kind: 'filter'; surface: 'shop'; dealer: DealerRef; filter: FilterSpec };

/** The row `log_buyer_events` reads. The server stamps user_id and received_at. */
export type WireEvent = Required<
  Omit<Database['public']['Tables']['buyer_events']['Insert'], 'user_id' | 'received_at'>
>;

export type UserId = string & { readonly __brand: 'UserId' };

/**
 * Who a queued row belongs to. `unknown` until the session has loaded, so a
 * row from that moment is not filed under a guest who never existed.
 */
export type Owner = 'unknown' | 'guest' | UserId;

export type Queued = { owner: Owner; row: WireEvent; retried: boolean };

/**
 * Signed-out rows still on the device, under the stable device key.
 * `claimedBy` is the account that first took those rows. The file stays until
 * the server stores them, so a later account on the phone does not adopt a
 * flush that has not landed. The key itself lives in a separate file and
 * stays when this buffer is removed.
 */
export type GuestBuffer = { guestKey: string; rows: WireEvent[]; claimedBy?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GUEST_SENDABLE = new Set<WireEvent['kind']>([
  'impression',
  'dwell',
  'pass',
  'undo',
  'dealer_click',
  'inquiry_open',
  'filter',
]);

export type DeviceKind = 'web-desktop' | 'web-mobile' | 'ios' | 'android';

/**
 * The device key. A stored uuid wins. Otherwise a uuid already on the buffer
 * is adopted. Otherwise the minted id is the key.
 */
export function resolveGuestKey(storedKey: string | null, buffer: GuestBuffer | null, minted: string): string {
  if (storedKey && UUID_RE.test(storedKey)) return storedKey;
  if (buffer && UUID_RE.test(buffer.guestKey)) return buffer.guestKey;
  return minted;
}

/** Kinds a signed-out browser may send. Saves and follows wait for sign-in. */
export function guestSendable(row: { kind: string }): boolean {
  return GUEST_SENDABLE.has(row.kind as WireEvent['kind']);
}

/** ios and android come from the platform. Web splits at the deck's wide breakpoint. */
export function deviceKind(platform: string, width: number | null): DeviceKind | null {
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  if (platform !== 'web') return null;
  if (width == null || !Number.isFinite(width)) return null;
  return width >= WIDE_BREAKPOINT ? 'web-desktop' : 'web-mobile';
}

export type Exposure = {
  id: string;
  surface: BuyerEventSurface;
  listing: ListingRef;
  startedAt: number;
  /** Null where the surface shows only the first photo. */
  photoMax: number | null;
};

/** A photo index and the listing it was paged on. */
export type TaggedPhoto = { listingId: string | null | undefined; index: number };

const DWELL_CAP_MS = 30 * 60 * 1000;
const FILTER_CAP_BYTES = 2048;
const PERMANENT_SQLSTATE = /^(22|23|28|42)[0-9A-Z]{3}$/;

const BLANK = {
  listing_id: null,
  dealer_id: null,
  exposure_id: null,
  position: null,
  dwell_ms: null,
  photo_index: null,
  filter: null,
  guest_key: null,
} as const;

export function toRow(
  event: EventInput,
  at: { id: string; now: number; exposureId: string | null },
): WireEvent {
  const row: WireEvent = {
    ...BLANK,
    id: at.id,
    kind: event.kind,
    surface: event.surface,
    occurred_at: new Date(at.now).toISOString(),
  };
  if ('listing' in event) {
    return {
      ...row,
      listing_id: event.listing.id,
      dealer_id: event.listing.dealer_id,
      exposure_id: at.exposureId,
    };
  }
  if (event.kind === 'filter') {
    return { ...row, filter: event.filter, dealer_id: event.surface === 'shop' ? event.dealer.id : null };
  }
  return { ...row, dealer_id: event.dealer.id };
}

export function startExposure(input: {
  id: string;
  surface: BuyerEventSurface;
  listing: ListingRef;
  now: number;
  tracksPhotos: boolean;
}): Exposure {
  return {
    id: input.id,
    surface: input.surface,
    listing: { id: input.listing.id, dealer_id: input.listing.dealer_id },
    startedAt: input.now,
    photoMax: input.tracksPhotos ? 0 : null,
  };
}

/**
 * The furthest photo reached. A photo paged on another listing is ignored, so
 * the Deck's index for the card that just left never counts for the card
 * that replaced it, and its reset to 0 is not paging.
 */
export function reachPhoto(exposure: Exposure, photo: TaggedPhoto): Exposure {
  if (exposure.photoMax === null) return exposure;
  if (photo.listingId !== exposure.listing.id || photo.index <= exposure.photoMax) return exposure;
  return { ...exposure, photoMax: photo.index };
}

export function impressionRow(exposure: Exposure, at: { id: string; position: number | null }): WireEvent {
  return { ...exposureRow(exposure, at.id, 'impression', exposure.startedAt), position: at.position };
}

export function dwellRow(exposure: Exposure, at: { id: string; now: number }): WireEvent {
  return {
    ...exposureRow(exposure, at.id, 'dwell', at.now),
    dwell_ms: Math.min(Math.max(at.now - exposure.startedAt, 0), DWELL_CAP_MS),
    photo_index: exposure.photoMax,
  };
}

function exposureRow(
  exposure: Exposure,
  id: string,
  kind: 'impression' | 'dwell',
  now: number,
): WireEvent {
  return {
    ...BLANK,
    id,
    kind,
    surface: exposure.surface,
    occurred_at: new Date(now).toISOString(),
    listing_id: exposure.listing.id,
    dealer_id: exposure.listing.dealer_id,
    exposure_id: exposure.id,
  };
}

/**
 * Adds a row; past `cap` the oldest go. A filter row not yet sent for the
 * same owner, surface, and shop takes the new spec and time and keeps its id,
 * so a search typed a letter at a time is one row.
 */
export function enqueue(
  queue: readonly Queued[],
  entry: Queued,
  cap: number,
): { queue: Queued[]; dropped: number } {
  const { row } = entry;
  if (row.kind === 'filter') {
    const at = queue.findIndex(
      (queued) =>
        queued.owner === entry.owner &&
        queued.row.kind === 'filter' &&
        queued.row.surface === row.surface &&
        queued.row.dealer_id === row.dealer_id,
    );
    if (at >= 0) {
      const next = [...queue];
      next[at] = { ...queue[at], row: { ...queue[at].row, filter: row.filter, occurred_at: row.occurred_at } };
      return { queue: next, dropped: 0 };
    }
  }
  const { kept, dropped } = keepNewest([...queue, entry], cap);
  return { queue: kept, dropped };
}

export function relabel(queue: readonly Queued[], from: Owner, to: Owner): Queued[] {
  return queue.map((entry) => (entry.owner === from ? { ...entry, owner: to } : entry));
}

/**
 * Sign-in. The guest's rows, from the device and from memory, become
 * `user`'s, each stamped with the key the caller passes. No other row
 * changes owner. A row already in both places is kept once.
 */
export function claimGuest(
  queue: readonly Queued[],
  stored: GuestBuffer | null,
  key: string,
  user: UserId,
): Queued[] {
  const claim = (row: WireEvent, retried: boolean): Queued => ({
    owner: user,
    row: { ...row, guest_key: key },
    retried,
  });
  const fromBuffer = (stored?.rows ?? []).map((row) => claim(row, false));
  const seen = new Set(fromBuffer.map((entry) => entry.row.id));
  return [
    ...fromBuffer,
    ...queue.flatMap((entry) => {
      if (entry.owner !== 'guest') return [entry];
      if (seen.has(entry.row.id)) return [];
      return [claim(entry.row, entry.retried)];
    }),
  ];
}

/** Rows into the device buffer, restamped with the caller's key. Past `cap` the oldest go. */
export function toGuestBuffer(
  stored: GuestBuffer | null,
  added: readonly WireEvent[],
  key: string,
  cap: number,
): { buffer: GuestBuffer; dropped: number } {
  const addedIds = new Set(added.map((row) => row.id));
  const merged = [...(stored?.rows ?? []).filter((row) => !addedIds.has(row.id)), ...added].map((row) => ({
    ...row,
    guest_key: key,
  }));
  const { kept, dropped } = keepNewest(merged, cap);
  return { buffer: { guestKey: key, rows: kept, ...(stored?.claimedBy ? { claimedBy: stored.claimedBy } : {}) }, dropped };
}

/**
 * The device buffer after one send. A failure leaves every row. A success
 * drops the ids the server stored. An empty buffer is null, which is the
 * signal to delete the file. Replaying a stored id inserts nothing, so a
 * crash between the insert and this drop is safe.
 */
export function bufferAfterSend(
  stored: GuestBuffer | null,
  sentIds: readonly string[],
  confirmed: boolean,
): GuestBuffer | null {
  if (!stored || !confirmed) return stored;
  const drop = new Set(sentIds);
  const rows = stored.rows.filter((row) => !drop.has(row.id));
  if (rows.length === 0) return null;
  return { ...stored, rows };
}

/** The buffer as storage returned it. Anything that is not one reads as none. */
export function parseGuestBuffer(raw: string | null): GuestBuffer | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestBuffer> | null;
    if (typeof parsed?.guestKey !== 'string' || !Array.isArray(parsed.rows)) return null;
    const claimedBy = typeof parsed.claimedBy === 'string' ? parsed.claimedBy : undefined;
    return { guestKey: parsed.guestKey, rows: parsed.rows, ...(claimedBy ? { claimedBy } : {}) };
  } catch {
    return null;
  }
}

/**
 * Which rows go now, for whoever holds the session. A row from an account
 * that is no longer signed in is dropped, because the server would file it
 * under the account that is. Guest and unknown rows wait.
 */
export function route(
  queue: readonly Queued[],
  session: UserId | null,
): { send: Queued[]; wait: Queued[]; dropped: number } {
  const send: Queued[] = [];
  const wait: Queued[] = [];
  let dropped = 0;
  for (const entry of queue) {
    if (entry.owner === 'guest' || entry.owner === 'unknown') wait.push(entry);
    else if (entry.owner === session) send.push(entry);
    else dropped += 1;
  }
  return { send, wait, dropped };
}

/** A Postgres error that the same rows would hit again: bad data, a broken rule, no session, or a schema mismatch. */
export function isPermanentFailure(code: string | null | undefined): boolean {
  return PERMANENT_SQLSTATE.test(code ?? '');
}

/**
 * After a send that may work later. The failed batch goes back to the head
 * once and is dropped the second time. Batches not yet tried go back as they
 * were.
 */
export function afterTransientFailure(
  queue: readonly Queued[],
  failed: readonly Queued[],
  untried: readonly Queued[],
  cap: number,
): { queue: Queued[]; dropped: number } {
  const again = failed.filter((entry) => !entry.retried).map((entry) => ({ ...entry, retried: true }));
  const { kept, dropped } = keepNewest([...again, ...untried, ...queue], cap);
  return { queue: kept, dropped: dropped + failed.length - again.length };
}

export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

/**
 * Whether a spec fits the 2048-byte check as Postgres prints it. jsonb text
 * puts a space after every `,` and `:`, so each one counts twice, even one
 * inside a string, which can only overcount.
 */
export function filterFits(spec: FilterSpec): boolean {
  let bytes = 0;
  for (const char of JSON.stringify(spec)) {
    const code = char.codePointAt(0) ?? 0;
    if (char === ',' || char === ':') bytes += 2;
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes <= FILTER_CAP_BYTES;
}

function keepNewest<T>(items: T[], cap: number): { kept: T[]; dropped: number } {
  const dropped = Math.max(0, items.length - cap);
  return { kept: dropped ? items.slice(dropped) : items, dropped };
}
