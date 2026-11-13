import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NAME_MAX_LENGTH, parseName } from '../src/lib/personName.ts';

const named = (first: string, last: string | null) => ({ ok: true, name: { first, last } });

test('trims and collapses spaces', () => {
  assert.deepEqual(parseName('  Ada   Lovelace '), named('Ada', 'Lovelace'));
  assert.deepEqual(parseName('Ada\t\nLovelace'), named('Ada', 'Lovelace'));
});

test('blank is empty', () => {
  assert.deepEqual(parseName(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parseName('   '), { ok: false, reason: 'empty' });
});

test('cap is inclusive', () => {
  assert.equal(NAME_MAX_LENGTH, 80);
  const atCap = `${'a'.repeat(40)} ${'b'.repeat(39)}`;
  assert.equal(atCap.length, 80);
  assert.deepEqual(parseName(atCap), named('a'.repeat(40), 'b'.repeat(39)));
  assert.deepEqual(parseName(`${atCap}b`), { ok: false, reason: 'too_long' });
});

test('cap is measured after collapsing', () => {
  const spaced = `  ${'a'.repeat(40)}     ${'b'.repeat(39)}  `;
  assert.ok(spaced.length > 80);
  assert.deepEqual(parseName(spaced), named('a'.repeat(40), 'b'.repeat(39)));
});

test('one word clears the last name', () => {
  assert.deepEqual(parseName('Cher'), named('Cher', null));
});

test('splits at the first space like handle_new_user', () => {
  assert.deepEqual(parseName('Mary Ann Smith'), named('Mary', 'Ann Smith'));
});

test('keeps a known two-word first name', () => {
  assert.deepEqual(parseName('Mary Ann Smith', 'Mary Ann'), named('Mary Ann', 'Smith'));
  assert.deepEqual(parseName('Mary Ann King', 'Mary Ann'), named('Mary Ann', 'King'));
  assert.deepEqual(parseName('Mary Ann', 'Mary Ann'), named('Mary Ann', null));
  assert.deepEqual(parseName('Mary Annabel Smith', 'Mary Ann'), named('Mary', 'Annabel Smith'));
  assert.deepEqual(parseName('Ada Lovelace', '  '), named('Ada', 'Lovelace'));
});
