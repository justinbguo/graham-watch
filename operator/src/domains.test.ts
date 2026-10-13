/**
 * Run with: npm test --prefix operator
 *
 * This parser decides which shops get added from a forty-line paste, so the
 * failure that matters is not a crash — it is a line quietly read as the wrong
 * thing, or not read at all.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseShops, splitCsvRow, toDomain } from './domains.ts';

test('toDomain takes the host out of whatever shape it arrives in', () => {
  const same = [
    'rolexpassion.com',
    'www.rolexpassion.com',
    'https://rolexpassion.com',
    'https://www.rolexpassion.com/collections/watches',
    'http://ROLEXPASSION.COM',
    '  rolexpassion.com  ',
    '<https://rolexpassion.com>',
    'rolexpassion.com,',
    'info@rolexpassion.com',
    'mailto:info@rolexpassion.com',
  ];
  for (const input of same) {
    assert.equal(toDomain(input), 'rolexpassion.com', input);
  }
});

test('toDomain refuses what is not a shop', () => {
  for (const input of ['', 'n/a', 'Shop Name', 'localhost', '127.0.0.1', '10.0.0.1', 'foo.local', 'nodots', '-']) {
    assert.equal(toDomain(input), null, input);
  }
});

test('splitCsvRow keeps a comma inside a quoted name', () => {
  assert.deepEqual(splitCsvRow('watches.com,"Watches, Ltd",info@watches.com'), [
    'watches.com',
    'Watches, Ltd',
    'info@watches.com',
  ]);
});

test('splitCsvRow unescapes a doubled quote', () => {
  assert.deepEqual(splitCsvRow('a.com,"The ""Best"" Watches"'), ['a.com', 'The "Best" Watches']);
});

test('splitCsvRow also accepts tabs and semicolons', () => {
  assert.deepEqual(splitCsvRow('a.com\tAlpha'), ['a.com', 'Alpha']);
  assert.deepEqual(splitCsvRow('a.com;Alpha'), ['a.com', 'Alpha']);
});

test('a plain list of domains, one per line', () => {
  const { shops, rejected, duplicates } = parseShops(`
    rolexpassion.com
    https://watchesofswitzerland.com/collections/rolex
    www.hodinkee.com
  `);

  assert.deepEqual(
    shops.map((shop) => shop.domain),
    ['rolexpassion.com', 'watchesofswitzerland.com', 'hodinkee.com']
  );
  assert.deepEqual(rejected, []);
  assert.equal(duplicates, 0);
});

test('a header names the columns, in any order and under any of its aliases', () => {
  const { shops } = parseShops(
    ['Shop Name,Website,Contact Email', '"Watches, Ltd",watches.com,info@watches.com'].join('\n')
  );

  assert.equal(shops.length, 1);
  assert.deepEqual(shops[0], {
    domain: 'watches.com',
    name: 'Watches, Ltd',
    email: 'info@watches.com',
    line: 2,
  });
});

test('a first line that holds a domain is data, not a header', () => {
  const { shops } = parseShops('rolexpassion.com\nhodinkee.com');
  assert.deepEqual(
    shops.map((shop) => shop.domain),
    ['rolexpassion.com', 'hodinkee.com']
  );
});

test('with no header, the domain can be in any column', () => {
  const { shops } = parseShops('Rolex Passion,rolexpassion.com\nhodinkee.com,Hodinkee');
  assert.deepEqual(
    shops.map((shop) => shop.domain),
    ['rolexpassion.com', 'hodinkee.com']
  );
});

test('the same shop written three ways is added once', () => {
  const { shops, duplicates } = parseShops(
    ['watches.com', 'www.watches.com', 'https://watches.com/collections/all'].join('\n')
  );

  assert.deepEqual(
    shops.map((shop) => shop.domain),
    ['watches.com']
  );
  assert.equal(duplicates, 2);
});

test('an unreadable line is reported with its number, not dropped', () => {
  const { shops, rejected } = parseShops(
    ['good.com', 'n/a', '', '# a note', 'better.com'].join('\n')
  );

  assert.deepEqual(
    shops.map((shop) => shop.domain),
    ['good.com', 'better.com']
  );
  assert.deepEqual(rejected, [{ line: 2, text: 'n/a', why: 'no domain here' }]);
});

test('prose containing a domain is rejected rather than guessed at', () => {
  // "they are at watches.com" could be read as watches.com, but a line the
  // operator did not mean as an entry should come back for them to look at.
  const { shops, rejected } = parseShops('they are at watches.com');
  assert.deepEqual(shops, []);
  assert.equal(rejected.length, 1);
});

test('a long junk line is truncated so the report stays readable', () => {
  const { rejected } = parseShops('x'.repeat(200));
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].text.length, 58);
  assert.ok(rejected[0].text.endsWith('…'));
});

test('an email column holding something that is not an email is ignored', () => {
  const { shops } = parseShops(['domain,email', 'watches.com,call them'].join('\n'));
  assert.equal(shops[0].email, undefined);
});

test('a header with no domain column is treated as data', () => {
  // Otherwise a file headed `notes,stuff` would silently eat its first shop.
  const { shops, rejected } = parseShops(['notes,stuff', 'watches.com'].join('\n'));
  assert.deepEqual(
    shops.map((shop) => shop.domain),
    ['watches.com']
  );
  assert.equal(rejected.length, 1);
});

test('an empty paste asks for nothing', () => {
  assert.deepEqual(parseShops(''), { shops: [], rejected: [], duplicates: 0 });
  assert.deepEqual(parseShops('\n\n  \n'), { shops: [], rejected: [], duplicates: 0 });
});
