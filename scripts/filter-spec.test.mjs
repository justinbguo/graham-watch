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
  assert.deepEqual(deckCacheKey(scrambled), ['deck', token]);
  assert.deepEqual(countsCacheKey(scrambled), ['listing-counts', token]);
  assert.equal(deckCacheKey(scrambled)[1], countsCacheKey(ordered)[1]);
  assert.deepEqual(deckCacheKey(null), ['deck', '{}']);
  assert.deepEqual(countsCacheKey(NO_FILTERS), ['listing-counts', '{}']);
  assert.deepEqual(facetsQueryKey(true), ['facets', '{}', true]);
  assert.deepEqual(facetsQueryKey(false), ['facets', '{}', false]);
  assert.deepEqual(facetsQueryKey(true, scrambled), ['facets', token, true]);

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

  assert.match(listings, /queryKey: keys\.deck\(filters\)/);
  assert.match(listings, /queryKey: keys\.counts\(filters\)/);
  assert.match(search, /queryKey: keys\.facetsQuery\(excludeOwn\)/);
  assert.match(match, /queryKey: keys\.filterMatch\(api\.filters\)/);
  assert.match(keys, /search: \(filters: unknown\) => \['search', filterCacheToken\(filters\)\]/);
  assert.match(
    keys,
    /searchCount: \(filters: unknown\) => \['listing-counts', 'search', filterCacheToken\(filters\)\]/,
  );
  // One sorter, the one the refill hotfix added. It now lives with the spec.
  assert.match(spec, /canonicalDeckFilters\(unwrap\(filters\)\)/);
});
