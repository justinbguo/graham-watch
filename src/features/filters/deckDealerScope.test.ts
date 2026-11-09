/**
 * The shop on Buy is one dealer id in the deck filter. Nothing else stores it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { presentDealerIdentity } from '../dealers/identity.ts';
import { NO_FILTERS, scopeDealer, soleDealer } from './types.ts';

const priced = {
  ...NO_FILTERS,
  brands: ['rolex'],
  dealers: ['alpha', 'beta'],
  prices: [{ min: 500_000, max: null as number | null }],
};

test('soleDealer is null unless the filter names one shop', () => {
  assert.equal(soleDealer(NO_FILTERS), null);
  assert.equal(soleDealer({ ...NO_FILTERS, dealers: [] }), null);
  assert.equal(soleDealer({ ...NO_FILTERS, dealers: ['alpha', 'beta'] }), null);
  assert.equal(soleDealer({ ...NO_FILTERS, dealers: ['beta', 'alpha'] }), null);
  assert.equal(soleDealer({ ...NO_FILTERS, dealers: ['alpha'] }), 'alpha');
});

test('scopeDealer keeps brand and price, and a second scope is the same object', () => {
  const scoped = scopeDealer(priced, 'alpha');
  assert.deepEqual(scoped.brands, ['rolex']);
  assert.deepEqual(scoped.prices, priced.prices);
  assert.deepEqual(scoped.dealers, ['alpha']);
  assert.notEqual(scoped, priced);
  assert.equal(scopeDealer(scoped, 'alpha'), scoped);

  const cleared = scopeDealer(scoped, null);
  assert.deepEqual(cleared.dealers, []);
  assert.deepEqual(cleared.brands, ['rolex']);
  assert.deepEqual(cleared.prices, scoped.prices);
  assert.notEqual(cleared, scoped);
  assert.equal(scopeDealer(cleared, null), cleared);
  assert.equal(scopeDealer(NO_FILTERS, null), NO_FILTERS);
});

test('presentDealerIdentity drops a blank description and keeps a real one', () => {
  const blank = presentDealerIdentity({
    id: 'shop',
    name: '  Vintage Vault  ',
    website: '  https://vintagevault.test  ',
    description: '   ',
    instagram: '',
    logo_url: null,
  });
  assert.equal(blank.description, null);
  assert.equal(blank.instagram, null);
  assert.equal(blank.website, 'https://vintagevault.test');
  assert.equal(blank.name, '  Vintage Vault  ');
  assert.equal(blank.logo_url, null);

  const kept = presentDealerIdentity({
    ...blank,
    description: '  Serviced in house.  ',
    website: null,
    instagram: ' vintagevault ',
  });
  assert.equal(kept.description, 'Serviced in house.');
  assert.equal(kept.instagram, 'vintagevault');
  assert.equal(kept.website, null);
  assert.equal(kept.name, blank.name);
});
