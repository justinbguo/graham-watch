import type { Database } from '../../src/lib/database.types.ts';

import { formatDuration, type Rollup } from './dashboard.ts';

type EventKind = Database['public']['Enums']['buyer_event_kind'];
type Surface = Database['public']['Enums']['buyer_event_surface'];
type AccountType = Database['public']['Enums']['account_type'];
type InquiryStatus = Database['public']['Enums']['inquiry_status'];

type TimelineKind = Exclude<EventKind, 'impression' | 'dwell' | 'inquiry_open'> | 'open' | 'inquiry';

export type Account = {
  id: string;
  collectorNumber: number;
  email: string | null;
  name: string;
  handle: string | null;
  accountType: AccountType | null;
  signedUpAt: string;
  onboardedAt: string | null;
  lastActiveAt: string | null;
  counts: { right: number; left: number; clicks: number; follows: number };
};

export type Watch = {
  type: 'watch';
  listingId: string;
  title: string | null;
  priceCents: number | null;
  currency: string | null;
  shopName: string | null;
  thumbPath: string | null;
  thumbSourceUrl: string | null;
};

export type Shop = { type: 'shop'; dealerId: string; name: string | null };

export type TimelineEvent = {
  id: string;
  at: string;
  time: string;
  label: string;
  where: string | null;
  subject: Watch | Shop | null;
  note: string | null;
  beforeSignIn: boolean;
};

export type TimelineDay = { key: string; label: string; events: TimelineEvent[] };

export type Taste = {
  positive: number;
  brands: Rollup[];
  shops: Rollup[];
  price: { currency: string; minCents: number; maxCents: number; count: number } | null;
  following: string[];
};

export type Onboarding = {
  onboardedAt: string | null;
  favoriteBrands: string[];
  huntingFor: string[];
  collectionSize: string | null;
  collectingYears: string | null;
  searchPainPoints: string[];
};

export type AccountDetail = {
  onboarding: Onboarding;
  taste: Taste;
  days: TimelineDay[];
  shown: number;
  total: number;
  more: boolean;
};

export function parseAccounts(value: unknown): Account[] {
  return array(value).map((item) => {
    const row = record(item);
    return {
      id: str(row.id),
      collectorNumber: num(row.collector_number),
      email: optional(row.email),
      name: nameOf(row),
      handle: optional(row.handle),
      accountType: keyOf(ACCOUNT_TYPES, row.account_type),
      signedUpAt: str(row.created_at),
      onboardedAt: optional(row.onboarded_at),
      lastActiveAt: optional(row.last_active),
      counts: {
        right: num(row.swipes_right),
        left: num(row.swipes_left),
        clicks: num(row.dealer_clicks),
        follows: num(row.follows),
      },
    };
  });
}

export function parseAccount(value: unknown): AccountDetail {
  const row = record(value);
  const onboarding = record(row.onboarding);
  const taste = record(row.taste);
  const events = array(row.timeline).map(parseEvent);
  return {
    onboarding: {
      onboardedAt: optional(onboarding.onboarded_at),
      favoriteBrands: strings(onboarding.favorite_brands),
      huntingFor: strings(onboarding.hunting_for),
      collectionSize: optional(onboarding.collection_size),
      collectingYears: optional(onboarding.collecting_years),
      searchPainPoints: strings(onboarding.search_pain_points),
    },
    taste: {
      positive: num(taste.positive),
      brands: rollups(taste.brands),
      shops: rollups(taste.shops),
      price: priceOf(taste.price),
      following: strings(taste.following),
    },
    days: groupByPacificDay(events),
    shown: events.length,
    total: num(row.total),
    more: row.more === true,
  };
}

export function formatPacific(iso: string | null, style: 'date' | 'dateTime'): string {
  return pacific(iso, style);
}

const PACIFIC = 'America/Los_Angeles';

const PACIFIC_FORMATS = {
  date: new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, month: 'short', day: 'numeric', year: 'numeric' }),
  dateTime: new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }),
  time: new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, hour: 'numeric', minute: '2-digit' }),
  day: new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, weekday: 'long', month: 'short', day: 'numeric' }),
  dayKey: new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, year: 'numeric', month: '2-digit', day: '2-digit' }),
};

const KIND_LABELS: Record<TimelineKind, string> = {
  save: 'Swiped right',
  pass: 'Swiped left',
  unsave: 'Removed from wishlist',
  undo: 'Took back a pass',
  dealer_click: 'Opened dealer site',
  follow: 'Followed',
  unfollow: 'Unfollowed',
  filter: 'Changed filters',
  open: 'Opened',
  inquiry: 'Asked the shop',
};

const SURFACE_LABELS: Record<Surface, string> = {
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

const NOTES: Partial<Record<TimelineKind, (row: Record<string, unknown>) => string | null>> = {
  open: (row) => (row.seconds == null ? null : formatDuration(num(row.seconds))),
  filter: (row) => describeFilter(row.filter),
  inquiry: describeInquiry,
};

const INQUIRY_OUTCOMES: Record<InquiryStatus, string> = {
  sent: 'Sent by Graham',
  failed: 'Graham could not send it',
  pending: 'Not sent',
};

const ACCOUNT_TYPES: Record<AccountType, true> = { buyer: true, dealer: true };

// jsonb sorts object keys by length, so the spec arrives in no reading order.
// These lead; any other key follows alphabetically.
const FILTER_LEAD = ['query', 'brands', 'dealers'];

const FILTER_WORDS: Record<'query' | 'dealers' | 'prices', (value: unknown) => string> = {
  query: (value) => (typeof value === 'string' && value.trim() ? `"${value.trim()}"` : ''),
  dealers: (value) => {
    const count = array(value).length;
    return count === 0 ? '' : `${count} ${count === 1 ? 'shop' : 'shops'}`;
  },
  prices: (value) => array(value).map(describeBand).filter(Boolean).join(', '),
};

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function parseEvent(value: unknown): TimelineEvent {
  const row = record(value);
  const kind = str(row.kind);
  const known = keyOf(KIND_LABELS, kind);
  const surface = keyOf(SURFACE_LABELS, row.surface);
  const at = str(row.at);
  return {
    id: str(row.id),
    at,
    time: pacific(at, 'time'),
    label: known ? KIND_LABELS[known] : kind.replaceAll('_', ' '),
    where: surface ? SURFACE_LABELS[surface] : null,
    subject: subjectOf(row),
    note: (known && NOTES[known]?.(row)) || null,
    beforeSignIn: row.guest === true,
  };
}

function subjectOf(row: Record<string, unknown>): Watch | Shop | null {
  const listingId = optional(row.listing_id);
  if (listingId) {
    const brand = optional(row.brand);
    return {
      type: 'watch',
      listingId,
      title: brand ? [brand, optional(row.model)].filter(Boolean).join(' ') : null,
      priceCents: row.price_cents == null ? null : num(row.price_cents),
      currency: optional(row.currency),
      shopName: optional(row.dealer_name),
      thumbPath: optional(row.thumb_path),
      thumbSourceUrl: optional(row.thumb_source_url),
    };
  }
  const dealerId = optional(row.dealer_id);
  return dealerId ? { type: 'shop', dealerId, name: optional(row.dealer_name) } : null;
}

function describeFilter(spec: unknown): string {
  const fields = record(spec);
  const parts = Object.keys(fields)
    .sort((a, b) => filterRank(a) - filterRank(b) || a.localeCompare(b))
    .map((key) => {
      const special = keyOf(FILTER_WORDS, key);
      return (special ? FILTER_WORDS[special] : listed)(fields[key]);
    })
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Cleared filters';
}

function filterRank(key: string): number {
  const rank = FILTER_LEAD.indexOf(key);
  return rank === -1 ? FILTER_LEAD.length : rank;
}

function describeBand(value: unknown): string {
  const band = record(value);
  const min = typeof band.min === 'number' && Number.isFinite(band.min) ? band.min : null;
  const max = typeof band.max === 'number' && Number.isFinite(band.max) ? band.max : null;
  if (min != null && max != null) return `${USD.format(min / 100)} to ${USD.format(max / 100)}`;
  if (max != null) return `under ${USD.format(max / 100)}`;
  if (min != null) return `over ${USD.format(min / 100)}`;
  return '';
}

function listed(value: unknown): string {
  return (Array.isArray(value) ? value : [value]).map(word).filter(Boolean).join(', ');
}

function word(value: unknown): string {
  if (typeof value === 'string') return value.replaceAll('_', ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function describeInquiry(row: Record<string, unknown>): string {
  const status = keyOf(INQUIRY_OUTCOMES, row.status) ?? 'pending';
  const outcome = status === 'pending' && optional(row.opened_at) ? 'Mail draft prepared' : INQUIRY_OUTCOMES[status];
  const message = optional(row.message)?.trim();
  return message ? `${outcome} · ${message}` : outcome;
}

function groupByPacificDay(events: TimelineEvent[]): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const event of events) {
    const key = pacific(event.at, 'dayKey');
    const last = days.at(-1);
    if (last?.key === key) last.events.push(event);
    else days.push({ key, label: pacific(event.at, 'day'), events: [event] });
  }
  return days;
}

function pacific(iso: string | null, format: keyof typeof PACIFIC_FORMATS): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  if (format !== 'dayKey') return PACIFIC_FORMATS[format].format(date);
  const parts = Object.fromEntries(PACIFIC_FORMATS.dayKey.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function nameOf(row: Record<string, unknown>): string {
  const full = [optional(row.first_name), optional(row.last_name)]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  if (full) return full;
  const handle = optional(row.handle);
  return handle ? `@${handle}` : 'No name yet';
}

function priceOf(value: unknown): Taste['price'] {
  const price = record(value);
  const currency = optional(price.currency);
  if (!currency) return null;
  return {
    currency,
    minCents: num(price.min_cents),
    maxCents: num(price.max_cents),
    count: num(price.count),
  };
}

function rollups(value: unknown): Rollup[] {
  return array(value).map((item) => {
    const row = record(item);
    return { value: str(row.value), count: num(row.count) };
  });
}

function keyOf<K extends string>(table: Record<K, unknown>, value: unknown): K | null {
  return typeof value === 'string' && Object.hasOwn(table, value) ? (value as K) : null;
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

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function optional(value: unknown): string | null {
  return value == null ? null : String(value);
}

function strings(value: unknown): string[] {
  return array(value).map((item) => str(item));
}
