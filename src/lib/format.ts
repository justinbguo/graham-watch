import type { DeckCard } from './models';

export function formatPrice(card: Pick<DeckCard, 'price_cents' | 'currency'>) {
  if (card.price_cents == null) return 'Price on request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: card.currency,
    maximumFractionDigits: 0,
  }).format(card.price_cents / 100);
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
