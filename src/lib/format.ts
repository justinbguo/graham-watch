import type { DeckCard } from './models';

export function formatPrice(card: Pick<DeckCard, 'price_cents' | 'currency'>) {
  if (card.price_cents == null) return 'Price on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: card.currency,
    maximumFractionDigits: 0,
  }).format(card.price_cents / 100);
}

type Priced = Pick<DeckCard, 'price_cents' | 'currency' | 'sold_at'>;

/**
 * What a list of watches adds up to. Watches priced on request are left out and
 * counted separately, because a total quietly short by one reads as the whole
 * answer. Mixed currencies return no total rather than adding pounds to dollars.
 *
 * A sold watch is not part of the total either. Its row shows "Sold" where the
 * price used to be, so counting it would leave a sum no visible price explains.
 */
export function totalPrice(cards: Priced[]): { total: string | null; onRequest: number } {
  const forSale = cards.filter((card) => card.sold_at == null);
  const priced = forSale.filter((card) => card.price_cents != null);
  const currencies = new Set(priced.map((card) => card.currency));
  const onRequest = forSale.length - priced.length;

  if (currencies.size !== 1) return { total: null, onRequest };

  const cents = priced.reduce((sum, card) => sum + (card.price_cents ?? 0), 0);
  return { total: formatPrice({ price_cents: cents, currency: priced[0].currency }), onRequest };
}

/** "Rolex Datejust". A watch whose model never came through is just its maker. */
export function formatName(card: Pick<DeckCard, 'brand' | 'model'>) {
  return [card.brand, card.model].filter(Boolean).join(' ');
}

/**
 * "Omega Speedmaster Professional, 1972" — the whole name on one line, for a
 * tile, a row, or the listing headline. Maker and model are one thing said in
 * one voice; an eyebrow over a title made every brand look like a section
 * heading, and the two type sizes made a short name and a long one different
 * heights.
 *
 * The year is part of the name, not of the specification: it is the second
 * thing anyone asks about a vintage watch, and "1601 · 1968 · 36mm" made a 1968
 * Datejust look like a 2015 one.
 */
export function formatTitle(card: Pick<DeckCard, 'brand' | 'model' | 'year'>) {
  const name = formatName(card) || 'Unknown watch';
  return card.year ? `${name}, ${card.year}` : name;
}

/**
 * A tile's one spec line. Nothing is printed under a tile, so the case size
 * belongs here — unlike on a card or the listing route, where it is a row in
 * the table a few lines down and saying it twice reads as filler.
 */
export function formatSpecs(card: Pick<DeckCard, 'reference' | 'case_size_mm'>) {
  return [card.reference, card.case_size_mm ? `${card.case_size_mm}mm` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Database enum to something you would say out loud: `yellow_gold` to `Yellow gold`. */
export function humanize(value: string): string {
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Forum timestamps: "2h ago", then a date once a week has passed. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  const delta = Math.max(0, now - then);

  if (delta < MINUTE) return 'Just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < 7 * DAY) return `${Math.floor(delta / DAY)}d ago`;

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(then);
}
