import { TIMEOUT } from '../_shared/timeouts.ts';

/**
 * What the shop's own feed says about a product beyond the watch itself.
 *
 * None of it reaches a buyer. It is here because a single count cannot explain
 * a shop: Collectors Corner NY publish 970 products, 87 of which are for sale,
 * and the difference is only visible per product.
 */
export type ItemMeta = {
  vendor: string | null;
  productType: string | null;
  sku: string | null;
  photoCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
};

/** A product the read saw and did not keep, and why. */
export type SkippedItem = {
  sourceUrl: string;
  title: string;
  reason: string;
  meta: ItemMeta | null;
};

/**
 * One pass over a shop's feed: what it kept, and what it threw away.
 *
 * The discards used to be a `return null` inside a map. A shop whose watches
 * all fell out of that filter looked identical to a shop with no watches, and
 * the only way to tell them apart was to read the adapter.
 */
export type AdapterRead = {
  items: SourceItem[];
  skipped: SkippedItem[];
};

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
  /** The operator reviewed this snapshot, so publishing must not replace it. */
  operatorEdited?: boolean;
  /** Absent on rows stored before the operator console needed to show this. */
  meta?: ItemMeta;
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
