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

export function formatSpecs(card: Pick<DeckCard, 'reference' | 'year' | 'case_size_mm'>) {
  return [card.reference, card.year, card.case_size_mm ? `${card.case_size_mm}mm` : null]
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
