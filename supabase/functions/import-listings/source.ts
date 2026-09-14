import { TIMEOUT } from '../_shared/timeouts.ts';

/**
 * One watch as the dealer's own site describes it, before any model has guessed
 * at it. Every platform adapter reduces to this, so the importer never needs to
 * know which shop software it is talking to.
 */
export type SourceItem = {
  /**
   * The platform's own product id where it publishes one, falling back to the
   * URL path. Keying on the path alone meant a dealer editing a product slug
   * read as a brand new watch, while the old one stayed on offer forever.
   */
  externalId: string;
  title: string;
  text: string;
  sourceUrl: string;
  photoUrls: string[];
  priceCents: number | null;
  currency: string | null;
  /**
   * False only when the shop states the watch is gone. A feed that says nothing
   * about stock is not announcing a sale, so silence has to read as available —
   * the other way round empties an import from any shop we misread.
   */
  available: boolean;
};

export const USER_AGENT = 'GrahamBot/0.1 (+https://graham.app)';

/**
 * Identifies one product across the several URLs that reach it. An import
 * started from `https://www.shop.com` stores `www` URLs; a sweep reads the
 * dealer's saved website, which has `www` stripped. Comparing the raw strings
 * made those the same watch twice, and made a sweep match nothing at all.
 */
export function productKey(raw: string): string {
  try {
    return new URL(raw).pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export async function fetchJson(url: URL): Promise<Json | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT.source),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
