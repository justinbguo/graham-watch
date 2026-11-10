/**
 * Filter identity for the Buy deck.
 *
 * Choosing Rolex then Tudor is the same filter as Tudor then Rolex, a blank
 * query is the default, and a brand listed twice is still one brand. The deck,
 * its counts, and the facet list cache that identity — not the object the
 * panel happened to be holding.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { catalogueFacets, UNKNOWN_FACET_LABEL, UNKNOWN_FACET_VALUE } from '../src/features/filters/facets.ts';
import {
  canonicalize,
  countsCacheKey,
  deckCacheKey,
  facetsQueryKey,
  filterCacheToken,
} from '../src/features/filters/spec.ts';
import { NO_FILTERS } from '../src/features/filters/types.ts';

const scrambled = {
  query: '  ',
  eras: ['seventies', 'fifties', 'fifties'],
  sizes: ['large', 'large'],
  prices: [
    { min: 500_000, max: 1_500_000 },
    { max: 500_000, min: null },
    { min: null, max: 500_000 },
  ],
  complications: ['chronograph', 'chronograph'],
  windings: ['manual', 'automatic'],
  materials: ['gold', 'steel'],
  styles: ['dive', 'dress'],
  dealers: ['b', 'a'],
  brands: ['tudor', 'rolex', 'rolex'],
};

const ordered = {
  brands: ['rolex', 'tudor'],
  dealers: ['a', 'b'],
  styles: ['dive', 'dress'],
  materials: ['gold', 'steel'],
  windings: ['automatic', 'manual'],
  complications: ['chronograph'],
  prices: [
    { min: null, max: 500_000 },
    { min: 500_000, max: 1_500_000 },
  ],
  sizes: ['large'],
  eras: ['fifties', 'seventies'],
};

test('order and duplicates do not change the spec or its key', () => {
  const fromScramble = canonicalize(scrambled);
  const fromOrder = canonicalize(ordered);
  assert.deepEqual(fromScramble.spec, ordered);
  assert.deepEqual(fromOrder.spec, ordered);
  assert.equal(fromScramble.key, fromOrder.key);
  assert.equal(fromScramble.key, JSON.stringify(ordered));
  // Input key order is not part of the identity either.
  assert.equal(
    canonicalize({ eras: ['modern'], brands: ['rolex'] }).key,
    canonicalize({ brands: ['rolex'], eras: ['modern'] }).key,
  );
});

test('defaults are omitted and a blank query is no query', () => {
  assert.deepEqual(canonicalize(null).spec, {});
  assert.deepEqual(canonicalize(undefined).spec, {});
  assert.deepEqual(canonicalize(NO_FILTERS).spec, {});
  assert.deepEqual(canonicalize({ query: '   ', brands: [], prices: [] }).spec, {});
  assert.equal(canonicalize(null).key, '{}');
  assert.equal(canonicalize(NO_FILTERS).key, canonicalize({ query: '\n', brands: [] }).key);
  assert.equal(
    canonicalize({ brands: ['rolex'] }).key,
    canonicalize({ ...NO_FILTERS, brands: ['rolex'], query: '  ' }).key,
  );
  assert.equal(canonicalize({ query: '  Datejust  ' }).spec.query, 'Datejust');
  assert.equal(canonicalize({ query: '  Datejust  ' }).key, '{"query":"Datejust"}');
  // A real cut stays. Only the unset dimensions are gone.
  assert.equal(canonicalize({ brands: ['rolex'] }).key.includes('dealers'), false);
  assert.equal(canonicalize({ brands: ['rolex'] }).key.includes('query'), false);
});

test('canonicalize is idempotent', () => {
  const once = canonicalize(scrambled);
  const twice = canonicalize(once);
  const fromSpec = canonicalize(once.spec);
  assert.deepEqual(twice, once);
  assert.deepEqual(fromSpec, once);
  assert.equal(canonicalize(twice).key, once.key);
  assert.deepEqual(canonicalize(canonicalize(once.spec)).spec, once.spec);
});

test('deck, counts, and facets cache the same token', () => {
  const token = canonicalize(scrambled).key;
  assert.deepEqual(deckCacheKey(scrambled), ['deck', token, 'newest', true, '']);
  assert.deepEqual(countsCacheKey(scrambled), ['listing-counts', token]);
  assert.equal(deckCacheKey(scrambled)[1], countsCacheKey(ordered)[1]);
  assert.deepEqual(deckCacheKey(null), ['deck', '{}', 'newest', true, '']);
  assert.deepEqual(countsCacheKey(NO_FILTERS), ['listing-counts', '{}']);
  assert.deepEqual(facetsQueryKey(true), ['facets', '{}', true, false]);
  assert.deepEqual(facetsQueryKey(false), ['facets', '{}', false, false]);
  assert.deepEqual(facetsQueryKey(true, scrambled), ['facets', token, true, false]);
  assert.deepEqual(facetsQueryKey(true, scrambled, true), ['facets', token, true, true]);

  // A swipe reads the deck key's second entry and asks for that filter's
  // counts. The entry is already a token; treating it as a filter object
  // would drop every cut and decrement the unfiltered count.
  const stored = deckCacheKey(scrambled)[1];
  assert.equal(filterCacheToken(stored), stored);
  assert.deepEqual(countsCacheKey(stored), ['listing-counts', stored]);
  assert.equal(canonicalize(stored).key, '{}');
});

test('the deck, the counts, and the facets list take their keys from the spec', () => {
  const listings = readFileSync(new URL('../src/data/listings.ts', import.meta.url), 'utf8');
  const search = readFileSync(new URL('../src/data/search.ts', import.meta.url), 'utf8');
  const match = readFileSync(new URL('../src/features/filters/useMatchCount.ts', import.meta.url), 'utf8');
  const keys = readFileSync(new URL('../src/data/keys.ts', import.meta.url), 'utf8');
  const spec = readFileSync(new URL('../src/features/filters/spec.ts', import.meta.url), 'utf8');

  assert.match(listings, /queryKey: keys\.deck\(filters, sort, favoritesFirst, tasteKey\)/);
  assert.match(listings, /queryKey: keys\.counts\(filters\)/);
  assert.match(search, /queryKey: keys\.facetsQuery\(excludeOwn\)/);
  assert.match(search, /queryKey: keys\.facetsQuery\(excludeOwn, filters, excludeSwiped\)/);
  assert.match(search, /supabase\.rpc\('listing_facets_v2'/);
  assert.match(search, /canonicalize\(filters\)\.spec/);
  const panel = readFileSync(new URL('../src/features/filters/FilterPanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /useFilterFacets\(filters/);
  assert.match(panel, /excludeSwiped: surface === 'deck'/);
  assert.match(match, /queryKey: keys\.filterMatch\(api\.filters\)/);
  assert.match(keys, /search: \(filters: unknown\) => \['search', filterCacheToken\(filters\)\]/);
  assert.match(
    keys,
    /searchCount: \(filters: unknown\) => \['listing-counts', 'search', filterCacheToken\(filters\)\]/,
  );
  // One sorter, the one the refill hotfix added. It now lives with the spec.
  assert.match(spec, /canonicalDeckFilters\(unwrap\(filters\)\)/);
});

function facetCard(overrides) {
  return {
    brand: 'Rolex',
    brand_key: 'rolex',
    model: 'Submariner',
    reference: '5513',
    dealer_id: 'shop-a',
    dealer: { name: 'Shop A' },
    style: 'diver',
    case_material: 'steel',
    winding: 'automatic',
    complications: ['date'],
    price_cents: 100_000,
    case_size_mm: 40,
    year: 1968,
    photos: [],
    ...overrides,
  };
}

function sumKind(rows, kind) {
  return rows.filter((row) => row.kind === kind).reduce((total, row) => total + row.count, 0);
}

test('shop and demo facets drop their own selection and keep Unknown in the total', () => {
  const cards = [
    facetCard({ id: 'rolex' }),
    facetCard({
      id: 'tudor',
      brand: 'Tudor',
      brand_key: 'tudor',
      style: null,
      complications: ['chronograph', 'date'],
      dealer_id: 'shop-b',
      dealer: { name: 'Shop B' },
      price_cents: 9_000_000,
    }),
    facetCard({
      id: 'blank',
      brand: '???',
      brand_key: null,
      style: null,
      case_material: null,
      winding: null,
      complications: [],
      dealer: null,
      price_cents: null,
    }),
  ];

  const open = catalogueFacets(cards, NO_FILTERS);
  for (const kind of ['brand', 'style', 'case_material', 'winding', 'dealer']) {
    assert.equal(sumKind(open, kind), cards.length, kind);
  }
  const unknownBrand = open.find((row) => row.kind === 'brand' && row.value === UNKNOWN_FACET_VALUE);
  assert.equal(unknownBrand.label, UNKNOWN_FACET_LABEL);
  assert.equal(unknownBrand.count, 1);

  // Choosing Rolex does not remove Tudor from the brand list. It does remove
  // Tudor from the style list, because style still has to honor the brand.
  const selected = catalogueFacets(cards, { ...NO_FILTERS, brands: ['rolex'] });
  assert.equal(
    selected.some((row) => row.kind === 'brand' && row.value === 'tudor'),
    true,
  );
  assert.equal(sumKind(selected, 'brand'), cards.length);
  assert.equal(sumKind(selected, 'style'), 1);
  assert.deepEqual(
    selected.filter((row) => row.kind === 'style').map((row) => row.value),
    ['diver'],
  );

  // Under $5k drops the Tudor. The blank watch has no price, so it drops too.
  const priced = catalogueFacets(cards, {
    ...NO_FILTERS,
    prices: [{ min: null, max: 500_000 }],
  });
  assert.deepEqual(
    priced.filter((row) => row.kind === 'brand').map((row) => row.value),
    ['rolex'],
  );
  assert.equal(sumKind(priced, 'brand'), 1);

  // Chronograph and date are both on the Tudor, so complication rows overlap.
  const complications = open.filter((row) => row.kind === 'complication' && row.value !== UNKNOWN_FACET_VALUE);
  assert.equal(sumKind(open, 'complication') > cards.length, true);
  assert.equal(
    complications.find((row) => row.value === 'date').count,
    2,
  );
});
