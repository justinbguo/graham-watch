import { formatPrice } from '@/lib/format';

import { intentLabel, type ExchangeIntent, type ExchangePost } from '@/data/exchange';

/** The board's name for a person. The given name stays on their profile. */
export function atHandle(handle: string | null) {
  return handle ? `@${handle}` : null;
}

/** A trade and a random post name what they are. Selling and buying can name a figure. */
export function hasPrice(intent: ExchangeIntent) {
  return intent === 'sell' || intent === 'buy';
}

export function priceLine(post: Pick<ExchangePost, 'intent' | 'price_cents' | 'currency'>) {
  if (!hasPrice(post.intent)) return intentLabel(post.intent);
  if (post.price_cents == null) return 'Budget open';
  const money = formatPrice(post);
  return post.intent === 'buy' ? `Up to ${money}` : money;
}

export function commentCount(count: number) {
  if (count === 1) return '1 comment';
  return `${count} comments`;
}

export const INTENTS: ExchangeIntent[] = ['sell', 'buy', 'trade', 'random'];

export const INTENT_OPTIONS = INTENTS.map((intent) => ({ intent, label: intentLabel(intent) }));

export const BODY_PLACEHOLDER: Record<ExchangeIntent, string> = {
  sell: 'Condition, what is included, and where you ship from.',
  buy: 'The reference you want, and what you will not accept.',
  trade: 'What you have, and what you would trade it for.',
  random: 'A find, a question, or a watch you want to show.',
};
