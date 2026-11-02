import type { DeckCard } from '@/lib/models';

import { matchesListing } from './match';
import { NO_FILTERS, type Filters } from './types';

export type ShopFacet = { kind: string; value: string; label: string; count: number };

/**
 * The bucket for a watch that has no value on this dimension.
 *
 * `brand_key()` stores null, not an empty string, when a brand has no
 * letters, and a dealer id is a uuid. Empty string is not a choice the
 * panel can toggle. The database uses the same value.
 */
export const UNKNOWN_FACET_VALUE = '';
export const UNKNOWN_FACET_LABEL = 'Unknown';

const UNKNOWN: { value: string; label: string } = {
  value: UNKNOWN_FACET_VALUE,
  label: UNKNOWN_FACET_LABEL,
};

type Bucket = { value: string; label: string };

type Dimension = {
  kind: string;
  /** This row's population ignores the selection on its own dimension. */
  clear: (filters: Filters) => Filters;
  buckets: (card: DeckCard) => Bucket[];
};

function one(value: string | null | undefined, label: string): Bucket[] {
  if (!value) return [UNKNOWN];
  return [{ value, label }];
}

/**
 * The same dimensions `listing_facets_v2` returns. Price, size, and era stay
 * in the filter and narrow these rows; they are not rows themselves, because
 * the size and price presets share their endpoints and would not add up.
 */
const DIMENSIONS: Dimension[] = [
  {
    kind: 'brand',
    clear: (filters) => ({ ...filters, brands: [] }),
    buckets: (card) => one(card.brand_key, card.brand),
  },
  {
    kind: 'dealer',
    clear: (filters) => ({ ...filters, dealers: [] }),
    buckets: (card) => (card.dealer ? [{ value: card.dealer_id, label: card.dealer.name }] : [UNKNOWN]),
  },
  {
    kind: 'style',
    clear: (filters) => ({ ...filters, styles: [] }),
    buckets: (card) => one(card.style, card.style ?? ''),
  },
  {
    kind: 'case_material',
    clear: (filters) => ({ ...filters, materials: [] }),
    buckets: (card) => one(card.case_material, card.case_material ?? ''),
  },
  {
    kind: 'winding',
    clear: (filters) => ({ ...filters, windings: [] }),
    buckets: (card) => one(card.winding, card.winding ?? ''),
  },
  {
    kind: 'complication',
    clear: (filters) => ({ ...filters, complications: [] }),
    buckets: (card) =>
      card.complications.length
        ? card.complications.map((value) => ({ value, label: value }))
        : [UNKNOWN],
  },
];

function countDimension(cards: DeckCard[], filters: Filters, dimension: Dimension): ShopFacet[] {
  const population = cards.filter((card) => matchesListing(card, dimension.clear(filters)));
  const counts = new Map<string, { label: string; count: number }>();
  for (const card of population) {
    for (const bucket of dimension.buckets(card)) {
      const row = counts.get(bucket.value);
      if (row) row.count += 1;
      else counts.set(bucket.value, { label: bucket.label, count: 1 });
    }
  }
  return [...counts.entries()].map(([value, row]) => ({
    kind: dimension.kind,
    value,
    label: row.label,
    count: row.count,
  }));
}

/**
 * Facet rows for watches already in hand.
 *
 * A shop page holds its whole inventory, and demo mode has no database, so
 * both count here instead of calling `listing_facets_v2`. The rule is the
 * same one the function implements: each dimension is counted with its own
 * selection removed. A missing value is the Unknown bucket, so brand, style,
 * material, and winding add up to the watches that survived the other cuts.
 * A watch with two complications is in both of those rows.
 */
export function facetRows(cards: DeckCard[], filters: Filters = NO_FILTERS): ShopFacet[] {
  return DIMENSIONS.flatMap((dimension) => countDimension(cards, filters, dimension)).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.count !== b.count) return b.count - a.count;
    if (a.value === b.value) return 0;
    return a.value < b.value ? -1 : 1;
  });
}

/**
 * The filter rows for one shop. No dealer row: you are already inside that
 * shop, so a dealer choice can only return everything.
 */
export function facetsOf(cards: DeckCard[], filters: Filters = NO_FILTERS): ShopFacet[] {
  return facetRows(cards, filters).filter((facet) => facet.kind !== 'dealer');
}

/** Deck and search options when there is no `listing_facets_v2` call. */
export function catalogueFacets(cards: DeckCard[], filters: Filters = NO_FILTERS): ShopFacet[] {
  return facetRows(cards, filters);
}
