import { formatPrice } from '@/lib/format';

import { intentLabel, type ExchangeIntent, type ExchangePost } from '@/data/exchange';

export function authorLine(handle: string | null, number: number) {
  const collector = `Collector #${number}`;
  return handle ? `@${handle} · ${collector}` : collector;
}

export function priceLine(post: Pick<ExchangePost, 'intent' | 'price_cents' | 'currency'>) {
  if (post.intent === 'trade') return 'Trade';
  if (post.price_cents == null) return 'Budget open';
  const money = formatPrice(post);
  return post.intent === 'buy' ? `Up to ${money}` : money;
}

export function commentCount(count: number) {
  if (count === 1) return '1 comment';
  return `${count} comments`;
}

export const INTENT_OPTIONS: { intent: ExchangeIntent; label: string }[] = [
  { intent: 'sell', label: intentLabel('sell') },
  { intent: 'buy', label: intentLabel('buy') },
  { intent: 'trade', label: intentLabel('trade') },
];

export const BODY_PLACEHOLDER: Record<ExchangeIntent, string> = {
  sell: 'Condition, what is included, and where you ship from.',
  buy: 'The reference you want, and what you will not accept.',
  trade: 'What you have, and what you would trade it for.',
};
