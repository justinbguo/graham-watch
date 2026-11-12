import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatPacific, parseAccount, parseAccounts } from './accounts.ts';

test('an account keeps its email, and a missing email stays missing', () => {
  const [paul, phone] = parseAccounts([
    { id: 'u1', collector_number: 1, email: 'pg@example.com', first_name: 'Paul', last_name: 'Graham', created_at: '2026-11-12T15:00:00Z', swipes_right: 3 },
    { id: 'u2', collector_number: 2, created_at: '2026-11-12T16:00:00Z' },
  ]);
  assert.equal(paul?.email, 'pg@example.com');
  assert.equal(paul?.name, 'Paul Graham');
  assert.equal(paul?.counts.right, 3);
  assert.equal(paul?.counts.left, 0);
  assert.equal(phone?.email, null);
});

test('a name falls back to the handle, then to a placeholder, and an unknown account type is null', () => {
  const [handled, blank] = parseAccounts([
    { id: 'u1', collector_number: 1, handle: 'pg', account_type: 'buyer', created_at: '2026-11-12T15:00:00Z' },
    { id: 'u2', collector_number: 2, first_name: '  ', account_type: 'operator', created_at: '2026-11-12T16:00:00Z' },
  ]);
  assert.equal(handled?.name, '@pg');
  assert.equal(handled?.accountType, 'buyer');
  assert.equal(blank?.name, 'No name yet');
  assert.equal(blank?.accountType, null);
  assert.deepEqual(parseAccounts({ not: 'a list' }), []);
});

test('a detail-screen open reads as Opened with its stay, grouped under its Pacific day', () => {
  const detail = parseAccount({
    timeline: [
      { id: 'e1', kind: 'open', surface: 'detail', at: '2026-11-12T06:30:00Z', seconds: 42, listing_id: 'l1', brand: 'Omega', model: 'Speedmaster', price_cents: 650000, currency: 'USD', dealer_id: 'd1', dealer_name: 'Vault' },
    ],
    total: 1,
  });
  const [day] = detail.days;
  assert.equal(day?.label, 'Wednesday, Nov 11');
  assert.equal(day?.events[0]?.label, 'Opened');
  assert.equal(day?.events[0]?.where, 'Listing');
  assert.equal(day?.events[0]?.note, '42s');
  assert.equal(detail.more, false);
});

test('an empty document reads as no history', () => {
  const detail = parseAccount(null);
  assert.deepEqual(detail.days, []);
  assert.equal(detail.shown, 0);
  assert.equal(detail.total, 0);
  assert.equal(detail.more, false);
  assert.equal(detail.taste.price, null);
  assert.deepEqual(detail.onboarding.favoriteBrands, []);
});

test('Pacific midnight splits two events that share a UTC date', () => {
  const detail = parseAccount({
    timeline: [
      { id: 'late', kind: 'save', surface: 'buy', at: '2026-11-12T08:30:00Z', listing_id: 'l1', dealer_id: 'd1' },
      { id: 'early', kind: 'pass', surface: 'buy', at: '2026-11-12T07:30:00Z', listing_id: 'l2', dealer_id: 'd1' },
    ],
    total: 4,
    more: true,
  });
  assert.deepEqual(
    detail.days.map((day) => [day.key, day.label, day.events.map((event) => event.label)]),
    [
      ['2026-11-12', 'Thursday, Nov 12', ['Swiped right']],
      ['2026-11-11', 'Wednesday, Nov 11', ['Swiped left']],
    ],
  );
  assert.equal(detail.shown, 2);
  assert.equal(detail.more, true);
});

test('a filter reads in words, in reading order, whatever order jsonb sent the keys', () => {
  const describe = (filter: unknown) =>
    parseAccount({ timeline: [{ id: 'f', kind: 'filter', surface: 'buy', at: '2026-11-12T15:00:00Z', filter }] }).days[0]
      ?.events[0]?.note;
  assert.equal(
    describe({
      query: 'speedmaster',
      brands: ['omega', 'rolex'],
      prices: [{ min: null, max: 500000 }, { min: 1500000, max: 5000000 }],
      dealers: ['d1', 'd2'],
    }),
    '"speedmaster" · omega, rolex · 2 shops · under $5,000, $15,000 to $50,000',
  );
  assert.equal(describe({ materials: ['yellow_gold'], prices: [{ min: 1000000, max: null }] }), 'yellow gold · over $10,000');
  assert.equal(describe({}), 'Cleared filters');
  assert.equal(describe({ hasOwnProperty: 1, constructor: { nested: true } }), '1');
});

test('an inquiry says how it left, then the message', () => {
  const notes = parseAccount({
    timeline: [
      { id: 'i1', kind: 'inquiry', at: '2026-11-12T15:04:00Z', status: 'sent', message: 'Is the bracelet original?', listing_id: 'l1', dealer_id: 'd1' },
      { id: 'i2', kind: 'inquiry', at: '2026-11-12T15:03:00Z', status: 'pending', opened_at: '2026-11-12T15:03:00Z', listing_id: 'l2', dealer_id: 'd1' },
      { id: 'i3', kind: 'inquiry', at: '2026-11-12T15:02:00Z', status: 'failed', listing_id: 'l3', dealer_id: 'd1' },
      { id: 'i4', kind: 'inquiry', at: '2026-11-12T15:01:00Z', status: 'pending', listing_id: 'l4', dealer_id: 'd1' },
    ],
  }).days[0]?.events;
  assert.deepEqual(
    notes?.map((event) => [event.label, event.where, event.note]),
    [
      ['Asked the shop', null, 'Sent by Graham · Is the bracelet original?'],
      ['Asked the shop', null, 'Mail draft prepared'],
      ['Asked the shop', null, 'Graham could not send it'],
      ['Asked the shop', null, 'Not sent'],
    ],
  );
});

test('a deleted watch keeps its shop, a follow names the shop, a guest row is flagged, and a new kind still reads', () => {
  const [gone, follow, newer] =
    parseAccount({
      timeline: [
        { id: 'e1', kind: 'save', surface: 'buy', at: '2026-11-12T15:03:00Z', guest: true, listing_id: 'l9', dealer_id: 'd1', dealer_name: 'Vault' },
        { id: 'e2', kind: 'follow', surface: 'profile', at: '2026-11-12T15:02:00Z', dealer_id: 'd1', dealer_name: 'Vault' },
        { id: 'e3', kind: 'share_link', surface: 'somewhere_new', at: '2026-11-12T15:01:00Z' },
      ],
    }).days[0]?.events ?? [];
  assert.deepEqual(gone?.subject, {
    type: 'watch',
    listingId: 'l9',
    title: null,
    priceCents: null,
    currency: null,
    shopName: 'Vault',
    thumbPath: null,
    thumbSourceUrl: null,
  });
  assert.equal(gone?.beforeSignIn, true);
  assert.deepEqual(follow?.subject, { type: 'shop', dealerId: 'd1', name: 'Vault' });
  assert.equal(follow?.where, 'Following');
  assert.equal(follow?.beforeSignIn, false);
  assert.equal(newer?.label, 'share link');
  assert.equal(newer?.where, null);
  assert.equal(newer?.subject, null);
});

test('taste keeps the database order and reads a price range in one currency', () => {
  const { taste, onboarding } = parseAccount({
    onboarding: { onboarded_at: '2026-11-12T15:00:00Z', favorite_brands: ['Omega'], collection_size: 'one' },
    taste: {
      positive: 3,
      brands: [{ value: 'Rolex', count: 2 }, { value: 'Omega', count: 1 }],
      shops: [{ value: 'Vault', count: 3 }],
      price: { currency: 'CHF', min_cents: 100000, max_cents: 900000, count: 3 },
      following: ['Vault'],
    },
  });
  assert.deepEqual(taste.brands.map((brand) => brand.value), ['Rolex', 'Omega']);
  assert.deepEqual(taste.price, { currency: 'CHF', minCents: 100000, maxCents: 900000, count: 3 });
  assert.deepEqual(taste.following, ['Vault']);
  assert.equal(onboarding.collectionSize, 'one');
  assert.equal(onboarding.collectingYears, null);
});

test('Pacific time carries its own zone across daylight saving', () => {
  assert.match(formatPacific('2026-07-04T19:00:00Z', 'dateTime'), /^Jul 4, 2026, 12:00\sPM PDT$/);
  assert.match(formatPacific('2026-11-12T06:30:00Z', 'dateTime'), /^Nov 11, 2026, 10:30\sPM PST$/);
  assert.equal(formatPacific('2026-11-12T06:30:00Z', 'date'), 'Nov 11, 2026');
  assert.equal(formatPacific(null, 'date'), formatPacific('not a date', 'date'));
});
