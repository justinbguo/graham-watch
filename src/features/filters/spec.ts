import type { CaseMaterial, Complication, WatchStyle, Winding } from '@/lib/models';

import type { Range } from './types';

/**
 * The one description of a Buy filter.
 *
 * The panel still holds a `Filters` value, empty arrays and all. The deck,
 * the counts, and the facet list cache this spec instead. Same dimensions —
 * brands, dealers, style, material, winding, complications, size presets,
 * era presets, and a text query. Price is the exception the panel already
 * made: bands are inclusive and in cents, the unit `listings.price_cents`
 * uses, and a watch matches if it sits in any band. Several bands are the
 * filter. One range would drop "Under $5k" together with "$15k–50k", which
 * the panel already allows.
 *
 * A missing field means no cut on that dimension. The panel's empty array
 * and blank query are that default, so they are not stored.
 */
export type FilterSpec = {
  query?: string;
  brands?: string[];
  dealers?: string[];
  styles?: WatchStyle[];
  materials?: CaseMaterial[];
  windings?: Winding[];
  complications?: Complication[];
  /** Inclusive bands, in cents. */
  prices?: Range[];
  /** `SIZE_PRESETS` ids. */
  sizes?: string[];
  /** `ERA_PRESETS` ids. */
  eras?: string[];
};

/** `spec` is the filter. `key` is that spec as JSON, keys in a fixed order. */
export type CanonicalFilter = {
  spec: FilterSpec;
  key: string;
};

/**
 * Sorted, trimmed filter lists. The deck refill introduced this so a refill
 * and its count could not disagree about Rolex-then-Tudor. `canonicalize`
 * calls it instead of sorting a second way, then drops defaults and repeats.
 */
export type CanonicalFilters = {
  query: string;
  brands: string[];
  dealers: string[];
  styles: string[];
  materials: string[];
  windings: string[];
  complications: string[];
  prices: Range[];
  sizes: string[];
  eras: string[];
};

function asRecord(filters: unknown): Record<string, unknown> {
  if (filters && typeof filters === 'object') return filters as Record<string, unknown>;
  return {};
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').sort();
}

function rangeList(value: unknown): Range[] {
  if (!Array.isArray(value)) return [];
  const ranges: Range[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const range = item as { min?: unknown; max?: unknown };
    ranges.push({
      min: typeof range.min === 'number' ? range.min : null,
      max: typeof range.max === 'number' ? range.max : null,
    });
  }
  ranges.sort((a, b) => {
    const minA = a.min ?? Number.NEGATIVE_INFINITY;
    const minB = b.min ?? Number.NEGATIVE_INFINITY;
    if (minA !== minB) return minA - minB;
    const maxA = a.max ?? Number.POSITIVE_INFINITY;
    const maxB = b.max ?? Number.POSITIVE_INFINITY;
    return maxA - maxB;
  });
  return ranges;
}

export function canonicalDeckFilters(filters: unknown): CanonicalFilters {
  const source = asRecord(filters);
  return {
    query: typeof source.query === 'string' ? source.query.trim() : '',
    brands: stringList(source.brands),
    dealers: stringList(source.dealers),
    styles: stringList(source.styles),
    materials: stringList(source.materials),
    windings: stringList(source.windings),
    complications: stringList(source.complications),
    prices: rangeList(source.prices),
    sizes: stringList(source.sizes),
    eras: stringList(source.eras),
  };
}

function unwrap(filters: unknown): unknown {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return filters;
  const record = filters as { spec?: unknown; key?: unknown };
  // A second pass receives what this function returned. The sorted lists live
  // on `spec`; `key` is derived and is not a filter dimension.
  if (
    typeof record.key === 'string' &&
    record.spec !== null &&
    typeof record.spec === 'object' &&
    !Array.isArray(record.spec)
  ) {
    return record.spec;
  }
  return filters;
}

/** Sort is already done. This only drops repeats, keeping that order. */
function strings<T extends string>(values: readonly string[]): T[] | undefined {
  const unique = [...new Set(values)] as T[];
  return unique.length ? unique : undefined;
}

function prices(values: readonly Range[]): Range[] | undefined {
  const unique: Range[] = [];
  for (const range of values) {
    if (unique.some((item) => item.min === range.min && item.max === range.max)) continue;
    unique.push({ min: range.min, max: range.max });
  }
  return unique.length ? unique : undefined;
}

/**
 * One filter, whatever order or defaults the caller handed in.
 *
 * Sorting and blank-query trimming come from `canonicalDeckFilters`. This
 * adds the two things that normalizer does not: repeated values collapse,
 * and a default (no query, no list) is left out. Two calls return the same
 * spec and the same key.
 */
export function canonicalize(filters: unknown): CanonicalFilter {
  const normalized = canonicalDeckFilters(unwrap(filters));
  const spec: FilterSpec = {};
  if (normalized.query) spec.query = normalized.query;
  const brands = strings(normalized.brands);
  if (brands) spec.brands = brands;
  const dealers = strings(normalized.dealers);
  if (dealers) spec.dealers = dealers;
  const styles = strings<WatchStyle>(normalized.styles);
  if (styles) spec.styles = styles;
  const materials = strings<CaseMaterial>(normalized.materials);
  if (materials) spec.materials = materials;
  const windings = strings<Winding>(normalized.windings);
  if (windings) spec.windings = windings;
  const complications = strings<Complication>(normalized.complications);
  if (complications) spec.complications = complications;
  const bands = prices(normalized.prices);
  if (bands) spec.prices = bands;
  const sizes = strings(normalized.sizes);
  if (sizes) spec.sizes = sizes;
  const eras = strings(normalized.eras);
  if (eras) spec.eras = eras;
  return { spec, key: JSON.stringify(spec) };
}

/**
 * The cache identity of a filter.
 *
 * A swipe reads the deck query key's second entry and asks for that same
 * filter's counts (`keys.counts(key[1])` in `swipes.ts`). That entry is
 * already a token. Running a string through `canonicalize` would see "no
 * filter" and take the count off the unfiltered deck.
 */
export function filterCacheToken(filters: unknown): string {
  if (typeof filters === 'string') return filters;
  return canonicalize(filters).key;
}

/**
 * The deck cache, one pile per filter, sort, and favorites-first setting.
 *
 * The filter token stays the second entry: a swipe reads `key[1]` and updates
 * that filter's counts, which do not depend on sort. Sort and favorites-first
 * follow it because `search_listings_v2` rejects a cursor built for a
 * different order. A new key starts with no cursor, so the bookmark from
 * "newest" is never sent to "price, low to high".
 */
export function deckCacheKey(filters: unknown = null, sort = 'newest', favoritesFirst = true) {
  return ['deck', filterCacheToken(filters), sort, favoritesFirst] as const;
}

export function countsCacheKey(filters: unknown = null) {
  return ['listing-counts', filterCacheToken(filters)] as const;
}

/**
 * Facet rows for the filter panel. `listing_facets` takes no filter yet, so
 * the token is the empty spec unless a caller passes one. The deck, the
 * counts, and this list still share one identity. Invalidation uses the
 * `['facets']` prefix, which matches either way.
 */
export function facetsQueryKey(excludeOwn = true, filters: unknown = null) {
  return ['facets', filterCacheToken(filters), excludeOwn] as const;
}
