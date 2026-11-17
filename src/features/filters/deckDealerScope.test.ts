/**
 * The shop on Buy is one dealer id in the deck filter. Nothing else stores it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { presentDealerIdentity } from '../dealers/identity.ts';
import { dealerDisplayName } from './dealers.ts';
import { NO_FILTERS, pressDealer, scopeDealer, soleDealer } from './types.ts';

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

test('pressDealer on the sole selected id clears dealers and keeps brands and prices', () => {
  const selected = scopeDealer(priced, 'alpha');
  const cleared = pressDealer(selected, 'alpha');
  assert.deepEqual(cleared.dealers, []);
  assert.deepEqual(cleared.brands, ['rolex']);
  assert.deepEqual(cleared.prices, priced.prices);
});

test('pressDealer on a different id switches to that one id and keeps brands and prices', () => {
  const selected = scopeDealer(priced, 'alpha');
  const switched = pressDealer(selected, 'beta');
  assert.deepEqual(switched.dealers, ['beta']);
  assert.deepEqual(switched.brands, ['rolex']);
  assert.deepEqual(switched.prices, priced.prices);

  const fromSeveral = pressDealer(priced, 'gamma');
  assert.deepEqual(fromSeveral.dealers, ['gamma']);
  assert.deepEqual(fromSeveral.brands, ['rolex']);
  assert.deepEqual(fromSeveral.prices, priced.prices);
});

test('pressDealer on an unfiltered set selects that one id', () => {
  const selected = pressDealer(NO_FILTERS, 'alpha');
  assert.deepEqual(selected.dealers, ['alpha']);
  assert.deepEqual(selected.brands, NO_FILTERS.brands);
  assert.deepEqual(selected.prices, NO_FILTERS.prices);
});

test('dealerDisplayName returns the shop name from the list', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal(dealerDisplayName(id, [{ id, name: 'Test Bench' }]), 'Test Bench');
  assert.equal(
    dealerDisplayName(id, [
      { id: 'other', name: 'Other Shop' },
      { id, name: id },
      { id, name: '   ' },
      { id, name: '  Test Bench  ' },
    ]),
    'Test Bench',
  );
});

test('dealerDisplayName returns null for a bare id, a blank name, and a name equal to the id', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  assert.equal(dealerDisplayName(id, []), null);
  assert.equal(dealerDisplayName(id, [{ id: 'other', name: 'Other Shop' }]), null);
  assert.equal(dealerDisplayName(id, [{ id, name: '   ' }]), null);
  assert.equal(dealerDisplayName(id, [{ id, name: null }]), null);
  assert.equal(dealerDisplayName(id, [{ id, name: id }]), null);
  assert.equal(dealerDisplayName(id, [{ id, name: `  ${id}  ` }]), null);
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
