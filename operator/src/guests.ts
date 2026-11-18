export type NamedCount = { name: string; count: number };

export type Guest = {
  guestKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sessions: number;
  listingsViewed: number;
  passes: number;
  dealerClicks: number;
  inquiryOpens: number;
  dealers: NamedCount[];
  brands: NamedCount[];
  country: string | null;
  device: string | null;
  claimedBy: string | null;
  claimedName: string | null;
  operator: boolean;
};

export type GuestEvent = {
  id: string;
  at: string;
  action: string;
  surface: string | null;
  dwellMs: number | null;
  photoIndex: number | null;
  filter: string | null;
  listingId: string | null;
  title: string | null;
  dealerName: string | null;
  priceCents: number | null;
  currency: string | null;
  thumbPath: string | null;
  thumbSourceUrl: string | null;
};

export type GuestSession = { startedAt: string; events: GuestEvent[] };

export type GuestDetail = { summary: Guest; sessions: GuestSession[] };

const ACTIONS: Record<string, string> = {
  impression: 'Impression',
  dwell: 'Dwell',
  save: 'Save',
  pass: 'Pass',
  unsave: 'Unsave',
  undo: 'Undo',
  dealer_click: 'Dealer click',
  inquiry_open: 'Inquiry',
  follow: 'Follow',
  unfollow: 'Unfollow',
  filter: 'Filter',
};

const SURFACES: Record<string, string> = {
  buy: 'Buy',
  buy_grid: 'Buy grid',
  search: 'Search',
  new: 'New',
  drops: 'Drops',
  detail: 'Listing',
  viewer: 'Photos',
  wishlist: 'Wishlist',
  shop: 'Shop page',
  profile: 'Following',
  messages: 'Messages',
};

export function parseGuests(value: unknown): Guest[] {
  return array(value).flatMap((item) => {
    const guest = parseGuestRow(item);
    return guest ? [guest] : [];
  });
}

export function parseGuest(value: unknown): GuestDetail {
  const row = record(value);
  return {
    summary: parseGuestRow(row.summary) ?? emptyGuest(),
    sessions: array(row.sessions).map(parseSession),
  };
}

export function visibleGuests(guests: readonly Guest[], showOperators: boolean): Guest[] {
  return showOperators ? [...guests] : guests.filter((guest) => !guest.operator);
}

export function guestTitle(guest: Guest): string {
  if (!guest.operator) return guest.claimedName ?? 'Guest';
  return guest.claimedName ? `Operator (${guest.claimedName})` : 'Operator';
}

function parseGuestRow(value: unknown): Guest | null {
  const row = record(value);
  const guestKey = optional(row.guest_key);
  if (!guestKey) return null;
  return {
    guestKey,
    firstSeenAt: str(row.first_seen_at),
    lastSeenAt: str(row.last_seen_at),
    sessions: num(row.sessions),
    listingsViewed: num(row.listings_viewed),
    passes: num(row.passes),
    dealerClicks: num(row.dealer_clicks),
    inquiryOpens: num(row.inquiry_opens),
    dealers: counts(row.dealers),
    brands: counts(row.brands),
    country: optional(row.country),
    device: optional(row.device),
    claimedBy: optional(row.claimed_by),
    claimedName: optional(row.claimed_name),
    operator: row.operator === true,
  };
}

function parseSession(value: unknown): GuestSession {
  const row = record(value);
  return {
    startedAt: str(row.started_at),
    events: array(row.events).map(parseEvent),
  };
}

function parseEvent(value: unknown): GuestEvent {
  const row = record(value);
  const brand = optional(row.brand);
  const model = optional(row.model);
  const title = [brand, model].filter(Boolean).join(' ');
  return {
    id: str(row.id),
    at: str(row.at),
    action: actionOf(str(row.kind)),
    surface: SURFACES[str(row.surface)] ?? null,
    dwellMs: optionalNum(row.dwell_ms),
    photoIndex: optionalNum(row.photo_index),
    filter: filterNote(row.filter),
    listingId: optional(row.listing_id),
    title: title || null,
    dealerName: optional(row.dealer_name),
    priceCents: optionalNum(row.price_cents),
    currency: optional(row.currency),
    thumbPath: optional(row.thumb_path),
    thumbSourceUrl: optional(row.thumb_source_url),
  };
}

function actionOf(kind: string): string {
  return ACTIONS[kind] ?? (kind ? kind.replaceAll('_', ' ') : 'Event');
}

function filterNote(value: unknown): string | null {
  if (value == null) return null;
  const fields = record(value);
  const query = typeof fields.query === 'string' ? fields.query.trim() : '';
  if (query) return `"${query}"`;
  const keys = Object.keys(fields);
  return keys.length ? keys.join(', ') : null;
}

function counts(value: unknown): NamedCount[] {
  return array(value).flatMap((item) => {
    const row = record(item);
    const name = optional(row.name);
    if (!name) return [];
    return [{ name, count: num(row.count) }];
  });
}

function emptyGuest(): Guest {
  return {
    guestKey: '',
    firstSeenAt: '',
    lastSeenAt: '',
    sessions: 0,
    listingsViewed: 0,
    passes: 0,
    dealerClicks: 0,
    inquiryOpens: 0,
    dealers: [],
    brands: [],
    country: null,
    device: null,
    claimedBy: null,
    claimedName: null,
    operator: false,
  };
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
