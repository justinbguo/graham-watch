import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixtureImportAllowed, parseFixtureListings } from '../supabase/functions/import-listings/fixture.ts';

const DEALER = 'ad0d7d71-741a-4b65-9465-641ed9cc0199';

test('fixture import stays off on the hosted project', () => {
  assert.equal(
    fixtureImportAllowed({
      get: (name) =>
        name === 'GRAHAM_ALLOW_FIXTURE_IMPORT'
          ? '1'
          : name === 'SUPABASE_URL'
            ? 'https://hbxgxtbtefpyutyqafoi.supabase.co'
            : undefined,
    }),
    false,
  );
  assert.equal(
    fixtureImportAllowed({
      get: (name) => (name === 'SUPABASE_URL' ? 'http://127.0.0.1:54321' : undefined),
    }),
    false,
  );
  assert.equal(
    fixtureImportAllowed({
      get: (name) =>
        name === 'GRAHAM_ALLOW_FIXTURE_IMPORT'
          ? '1'
          : name === 'SUPABASE_URL'
            ? 'http://kong:8000'
            : undefined,
    }),
    true,
  );
});

test('a fixture listing needs a dealer and a brand', () => {
  const parsed = parseFixtureListings({
    dealerId: DEALER,
    listings: [{ brand: 'Fixture', model: 'Drop', price_cents: 125000 }],
  });
  assert.equal(parsed.dealerId, DEALER);
  assert.equal(parsed.listings[0]?.brand, 'Fixture');
  assert.throws(() => parseFixtureListings({ dealerId: DEALER, listings: [] }), /1 to 5/);
  assert.throws(() => parseFixtureListings({ dealerId: 'nope', listings: [{ brand: 'Fixture' }] }), /dealerId/);
});
