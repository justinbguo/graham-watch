import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type ViewabilityConfig, type ViewToken } from 'react-native';

import { isDemo } from '@/lib/demo';
import type { BuyerEventSurface } from '@/lib/models';
import { secureStorage } from '@/lib/secureStorage';
import { supabase } from '@/lib/supabase';

import {
  afterTransientFailure,
  batches,
  bufferAfterSend,
  claimGuest,
  dwellRow,
  enqueue,
  filterFits,
  impressionRow,
  isPermanentFailure,
  parseGuestBuffer,
  reachPhoto,
  relabel,
  route,
  startExposure,
  toGuestBuffer,
  toRow,
  type EventInput,
  type ListingRef,
  type Owner,
  type Queued,
  type TaggedPhoto,
  type UserId,
  type WireEvent,
} from './listingEventQueue';

/**
 * The buyer event log as screens see it: what a buyer looked at and did, kept
 * for a ranker that does not exist yet. Every export returns at once and
 * never throws, and nothing here touches the query cache, so the log cannot
 * reach a gesture, a mutation, or the deck.
 *
 * Rows wait in memory and go in batches through `log_buyer_events`. A guest's
 * rows wait on the device until sign-in claims them. The decisions live in
 * `listingEventQueue.ts`; this file holds the timers, storage, network, and
 * hooks.
 */

export type { EventInput, ListingRef, TaggedPhoto };
export { newId as newEventId };

const BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 10_000;
const RETRY_DELAY_MS = 30_000;
const SEND_TIMEOUT_MS = 10_000;
const MEMORY_CAP = 500;
const GUEST_CAP = 100;
const GUEST_STORAGE = 'graham.events.guest';
const VIEWABILITY: ViewabilityConfig = { itemVisiblePercentThreshold: 50, minimumViewTime: 500 };

let owner: Owner = 'unknown';
let queue: Queued[] = [];
let work: Promise<void> = Promise.resolve();
let flushWaiting = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerAt = 0;
let retryAt = 0;
/** The exposure open on each surface and listing, so a gesture on a card on screen carries its id. */
const openExposures = new Map<string, string>();

AppState.addEventListener('change', (state) => {
  if (state !== 'active') flushEvents();
});

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flushEvents());
}

export function logEvent(event: EventInput, held?: { id: string; occurredAt: number }): void {
  try {
    if (event.kind === 'filter' && !filterFits(event.filter)) {
      warn('a filter over 2048 bytes was not logged');
      return;
    }
    const exposureId =
      'listing' in event ? (openExposures.get(exposureKey(event.surface, event.listing.id)) ?? null) : null;
    push(toRow(event, { id: held?.id ?? newId(), now: held?.occurredAt ?? Date.now(), exposureId }));
    // A reload is how the deck picks up a new score. The ten-second batch
    // would still be in memory when the page goes away.
    if (
      event.kind === 'save' ||
      event.kind === 'pass' ||
      event.kind === 'undo' ||
      event.kind === 'unsave' ||
      event.kind === 'dealer_click'
    ) {
      flushEvents();
    }
  } catch (error) {
    warn('an event was not logged', error);
  }
}

/**
 * Who the next rows belong to. Telemetry calls it once the session has loaded
 * and on every change of the signed-in id, sign-out included. Sign-in claims
 * the guest buffer: its rows go to this account with their guest key. The
 * file stays until the server confirms the insert.
 */
export function setEventUser(userId: string | null): void {
  if (isDemo) return;
  const next = userId === null ? 'guest' : (userId as UserId);
  if (next === owner) return;
  if (owner === 'unknown') queue = relabel(queue, 'unknown', next);
  owner = next;
  if (next === 'guest') {
    flushEvents();
    return;
  }
  schedule(async () => {
    await claim(next);
    await flush();
  });
}

/** Sends what is queued, or writes a guest's rows to the device. Starts the work and returns. */
export function flushEvents(): void {
  if (isDemo || flushWaiting) return;
  flushWaiting = true;
  schedule(async () => {
    flushWaiting = false;
    await flush();
  });
}

export type ExposureOptions = {
  surface: BuyerEventSurface;
  /** Anything beyond focus and the app being in front. The Deck passes `deckOnTop`. */
  active?: boolean;
  /** The photo on screen and the listing it was paged on. Absent where only the first photo shows. */
  photo?: TaggedPhoto;
  /** The pile the card came from. The impression's position is the card's first-shown place in it. */
  pile?: string;
};

/**
 * One card on screen alone: an impression when it shows, a dwell with the
 * furthest photo reached when it stops showing. Leaving the screen, the app
 * going to the background, `active` turning false, and a new card all close
 * the exposure.
 */
export function useExposure(card: ListingRef | null | undefined, options: ExposureOptions): void {
  const { surface, photo, pile } = options;
  const showing = useShowing(options.active ?? true);
  const listingId = showing ? card?.id : undefined;
  const dealerId = card?.dealer_id;
  const tracksPhotos = photo !== undefined;
  const open = useRef<OpenExposure | null>(null);
  const seen = useRef<PileOrder>({ pile, order: new Map() });

  useEffect(() => {
    if (!listingId || !dealerId) return;
    const exposure = openExposure(
      surface,
      { id: listingId, dealer_id: dealerId },
      pileOrdinal(seen.current, pile, listingId),
      tracksPhotos,
    );
    open.current = exposure;
    return () => {
      exposure.close();
      open.current = null;
    };
  }, [listingId, dealerId, surface, pile, tracksPhotos]);

  useEffect(() => {
    if (photo) open.current?.reach(photo);
  }, [listingId, photo?.listingId, photo?.index]);
}

export type ListExposureProps<Item> = {
  onViewableItemsChanged: (info: { viewableItems: ViewToken<Item>[]; changed: ViewToken<Item>[] }) => void;
  viewabilityConfig: ViewabilityConfig;
};

type ListOptions<Item> = { active?: boolean; cardsOf?: (item: Item) => readonly ListingRef[] };

/**
 * Exposures for a FlatList: spread the result onto it. A card that is at
 * least half on screen for half a second gets an impression at its place in
 * `data`, and a dwell when it leaves. `cardsOf` names the cards inside one
 * row, for a list whose rows hold several.
 */
export function useListExposures<Item extends ListingRef>(
  surface: BuyerEventSurface,
  data: readonly Item[],
  options?: { active?: boolean },
): ListExposureProps<Item>;
export function useListExposures<Item extends { id: string }>(
  surface: BuyerEventSurface,
  data: readonly Item[],
  options: ListOptions<Item> & { cardsOf: (item: Item) => readonly ListingRef[] },
): ListExposureProps<Item>;
export function useListExposures<Item extends { id: string }>(
  surface: BuyerEventSurface,
  data: readonly Item[],
  options: ListOptions<Item> = {},
): ListExposureProps<Item> {
  const showing = useShowing(options.active ?? true);
  const cardsOf = options.cardsOf ?? ((item: Item) => [item as unknown as ListingRef]);
  const list = useRef<ListState<Item>>({ surface, data, showing, cardsOf, viewable: [], open: new Map() });
  Object.assign(list.current, { surface, data, showing, cardsOf });

  const [props] = useState<ListExposureProps<Item>>(() => ({
    onViewableItemsChanged: ({ viewableItems }) => {
      list.current.viewable = viewableItems.flatMap((token) => (token.item ? [token.item.id] : []));
      reconcile(list.current);
    },
    viewabilityConfig: VIEWABILITY,
  }));

  useEffect(() => reconcile(list.current), [showing, data]);

  useEffect(() => {
    const { open } = list.current;
    return () => {
      for (const exposure of open.values()) exposure.close();
      open.clear();
    };
  }, []);

  return props;
}

type OpenExposure = { reach: (photo: TaggedPhoto) => void; close: () => void };

type PileOrder = { pile: string | undefined; order: Map<string, number> };

type ListState<Item> = {
  surface: BuyerEventSurface;
  data: readonly Item[];
  showing: boolean;
  cardsOf: (item: Item) => readonly ListingRef[];
  viewable: string[];
  open: Map<string, OpenExposure>;
};

function openExposure(
  surface: BuyerEventSurface,
  listing: ListingRef,
  position: number | null,
  tracksPhotos: boolean,
): OpenExposure {
  let exposure = startExposure({ id: newId(), surface, listing, now: Date.now(), tracksPhotos });
  const key = exposureKey(surface, listing.id);
  openExposures.set(key, exposure.id);
  push(impressionRow(exposure, { id: newId(), position }));
  let closed = false;
  return {
    reach: (photo) => {
      if (!closed) exposure = reachPhoto(exposure, photo);
    },
    close: () => {
      if (closed) return;
      closed = true;
      if (openExposures.get(key) === exposure.id) openExposures.delete(key);
      push(dwellRow(exposure, { id: newId(), now: Date.now() }));
    },
  };
}

/**
 * Brings the open exposures in line with the rows on screen now. It reads the
 * whole viewable set, never FlatList's `changed` list, so running it twice
 * changes nothing, and a remounted grid, a block whose big card stays while
 * its others change, and a pause for a sheet all come out right.
 */
function reconcile<Item extends { id: string }>(list: ListState<Item>): void {
  const rows = new Map(list.data.map((item) => [item.id, item]));
  const shown = list.showing
    ? list.viewable.flatMap((id) => {
        const row = rows.get(id);
        return row ? list.cardsOf(row) : [];
      })
    : [];
  const shownIds = new Set(shown.map((card) => card.id));
  for (const [id, exposure] of list.open) {
    if (shownIds.has(id)) continue;
    exposure.close();
    list.open.delete(id);
  }
  if (!shown.length) return;
  const rank = new Map(list.data.flatMap((item) => list.cardsOf(item)).map((card, index) => [card.id, index]));
  for (const card of shown) {
    if (!list.open.has(card.id)) list.open.set(card.id, openExposure(list.surface, card, rank.get(card.id) ?? null, false));
  }
}

/** The card's place among the distinct cards this pile has shown, or null without a pile. */
function pileOrdinal(seen: PileOrder, pile: string | undefined, listingId: string): number | null {
  if (pile === undefined) return null;
  if (seen.pile !== pile) {
    seen.pile = pile;
    seen.order = new Map();
  }
  const known = seen.order.get(listingId);
  if (known !== undefined) return known;
  seen.order.set(listingId, seen.order.size);
  return seen.order.size - 1;
}

/** The screen has focus, the app is not in the background, and the caller says the card is up. */
function useShowing(active: boolean): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [inFront, setInFront] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setInFront(state !== 'background'));
    return () => subscription.remove();
  }, []);
  return active && focused && inFront;
}

function push(row: WireEvent): void {
  if (isDemo) return;
  const next = enqueue(queue, { owner, row, retried: false }, MEMORY_CAP);
  queue = next.queue;
  if (next.dropped) warn(`dropped the oldest ${next.dropped} unsent events`);
  if (queue.length >= BATCH_SIZE) flushEvents();
  else flushSoon(FLUSH_DELAY_MS);
}

function schedule(task: () => Promise<void>): void {
  work = work.then(task).catch((error: unknown) => warn('a flush failed', error));
}

function flushSoon(delayMs: number): void {
  const at = Date.now() + delayMs;
  if (timer && timerAt <= at) return;
  if (timer) clearTimeout(timer);
  timerAt = at;
  timer = setTimeout(() => {
    timer = null;
    flushEvents();
  }, delayMs);
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const guestRows = queue.filter((entry) => entry.owner === 'guest').map((entry) => entry.row);
  if (guestRows.length) {
    queue = queue.filter((entry) => entry.owner !== 'guest');
    await keepForGuest(guestRows);
  }
  if (!queue.some((entry) => entry.owner !== 'guest' && entry.owner !== 'unknown')) return;
  if (Date.now() < retryAt) {
    flushSoon(retryAt - Date.now());
    return;
  }

  const { data } = await supabase.auth.getSession();
  const routed = route(queue, (data.session?.user.id ?? null) as UserId | null);
  queue = routed.wait;
  if (routed.dropped) warn(`dropped ${routed.dropped} events from an account that is signed out`);

  const groups = batches(routed.send, BATCH_SIZE);
  for (const [index, batch] of groups.entries()) {
    const code = await send(batch);
    if (code === null) {
      await forgetConfirmed(batch.map((entry) => entry.row.id));
      continue;
    }
    if (isPermanentFailure(code)) {
      warn(`the database refused ${batch.length} events (${code})`);
      continue;
    }
    const next = afterTransientFailure(queue, batch, groups.slice(index + 1).flat(), MEMORY_CAP);
    queue = next.queue;
    warn(`could not send ${batch.length} events (${code || 'network'}), trying once more in 30 s`);
    if (next.dropped) warn(`dropped ${next.dropped} events after a second failure`);
    retryAt = Date.now() + RETRY_DELAY_MS;
    flushSoon(RETRY_DELAY_MS);
    return;
  }
}

/** One try. Null when the rows are stored, otherwise the error code. */
async function send(batch: readonly Queued[]): Promise<string | null> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
  try {
    const { error } = await supabase
      .rpc('log_buyer_events', { p_events: batch.map((entry) => entry.row) })
      .abortSignal(abort.signal);
    return error ? (error.code ?? '') : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function keepForGuest(rows: WireEvent[]): Promise<void> {
  const stored = parseGuestBuffer(await secureStorage.getItem(GUEST_STORAGE));
  const { buffer, dropped } = toGuestBuffer(stored, rows, newId(), GUEST_CAP);
  if (dropped) warn(`the guest buffer is full, dropped the oldest ${dropped} events`);
  await secureStorage.setItem(GUEST_STORAGE, JSON.stringify(buffer));
}

async function claim(user: UserId): Promise<void> {
  const raw = await secureStorage.getItem(GUEST_STORAGE);
  if (owner !== user) return;
  const stored = parseGuestBuffer(raw);
  // A failed flush stays on disk under the account that already claimed it.
  if (stored?.claimedBy && stored.claimedBy !== user) return;
  queue = claimGuest(queue, stored, newId(), user);
  if (!stored || stored.rows.length === 0 || stored.claimedBy === user) return;
  await secureStorage.setItem(GUEST_STORAGE, JSON.stringify({ ...stored, claimedBy: user }));
}

/** Drop stored guest rows only after `log_buyer_events` accepted their ids. */
async function forgetConfirmed(ids: readonly string[]): Promise<void> {
  const stored = parseGuestBuffer(await secureStorage.getItem(GUEST_STORAGE));
  const next = bufferAfterSend(stored, ids, true);
  if (next === stored) return;
  if (!next) {
    await secureStorage.removeItem(GUEST_STORAGE);
    return;
  }
  await secureStorage.setItem(GUEST_STORAGE, JSON.stringify(next));
}

function exposureKey(surface: BuyerEventSurface, listingId: string): string {
  return `${surface}:${listingId}`;
}

/** A version 4 id. Hermes has no `crypto.randomUUID`, and a browser gives it only to a secure page. */
function newId(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Dev only. Counts and codes, never a row, a user id, or a filter. */
function warn(message: string, error?: unknown): void {
  if (!__DEV__) return;
  console.warn(`[listing-events] ${message}`, ...(error instanceof Error ? [error.name] : []));
}
