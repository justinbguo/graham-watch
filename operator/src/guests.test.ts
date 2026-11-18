import assert from 'node:assert/strict';
import test from 'node:test';

import { guestTitle, parseGuest, parseGuests, visibleGuests } from './guests.ts';

test('a list row keeps its counts, and operator rows are the ones hidden by default', () => {
  const [operator, guest] = parseGuests([
    {
      guest_key: 'op',
      first_seen_at: '2026-11-01T00:00:00Z',
      last_seen_at: '2026-11-12T18:00:00Z',
      sessions: 3,
      listings_viewed: 4,
      passes: 1,
      dealer_clicks: 2,
      inquiry_opens: 0,
      dealers: [{ name: 'Vault', count: 5 }],
      brands: [{ name: 'Omega', count: 4 }],
      country: 'US',
      device: 'web-desktop',
      claimed_by: 'user-1',
      claimed_name: 'Ada',
      operator: true,
    },
    {
      guest_key: 'guest',
      first_seen_at: '2026-11-02T00:00:00Z',
      last_seen_at: '2026-11-11T18:00:00Z',
      sessions: 1,
      listings_viewed: 2,
      passes: 1,
      operator: false,
    },
  ]);

  assert.equal(operator?.sessions, 3);
  assert.equal(operator?.listingsViewed, 4);
  assert.equal(operator?.passes, 1);
  assert.equal(operator?.dealerClicks, 2);
  assert.equal(operator?.dealers[0]?.name, 'Vault');
  assert.equal(operator?.dealers[0]?.count, 5);
  assert.equal(operator?.brands[0]?.name, 'Omega');
  assert.equal(operator?.country, 'US');
  assert.equal(operator?.device, 'web-desktop');
  assert.equal(operator?.claimedBy, 'user-1');
  assert.equal(guestTitle(operator!), 'Operator (Ada)');
  assert.equal(guestTitle({ ...operator!, claimedName: null }), 'Operator');
  assert.equal(guest?.operator, false);
  assert.deepEqual(
    visibleGuests([operator!, guest!], false).map((row) => row.guestKey),
    ['guest'],
  );
  assert.equal(visibleGuests([operator!, guest!], true).length, 2);
  assert.deepEqual(parseGuests({ not: 'a list' }), []);
});

test('a detail keeps two sessions and the fields on each event', () => {
  const detail = parseGuest({
    summary: {
      guest_key: 'g1',
      first_seen_at: '2026-11-12T15:00:00Z',
      last_seen_at: '2026-11-12T16:00:00Z',
      sessions: 2,
      listings_viewed: 1,
      operator: false,
    },
    sessions: [
      {
        started_at: '2026-11-12T15:00:00Z',
        events: [
          {
            id: 'e1',
            at: '2026-11-12T15:00:00Z',
            kind: 'impression',
            surface: 'buy',
            listing_id: 'l1',
            brand: 'Omega',
            model: 'Speedmaster',
            dealer_name: 'Vault',
            price_cents: 1250000,
            currency: 'USD',
            thumb_path: 'photos/l1.jpg',
          },
        ],
      },
      {
        started_at: '2026-11-12T16:00:00Z',
        events: [
          {
            id: 'e2',
            at: '2026-11-12T16:10:00Z',
            kind: 'pass',
            surface: 'detail',
            dwell_ms: 4000,
            photo_index: 2,
            filter: { query: 'speedmaster' },
            listing_id: 'l1',
            brand: 'Omega',
            model: 'Speedmaster',
            dealer_name: 'Vault',
            price_cents: 1250000,
            currency: 'USD',
          },
        ],
      },
    ],
  });

  assert.equal(detail.summary.guestKey, 'g1');
  assert.equal(detail.summary.sessions, 2);
  assert.deepEqual(
    detail.sessions.map((session) => session.events.map((event) => event.id)),
    [['e1'], ['e2']],
  );
  const [opened, passed] = [detail.sessions[0]?.events[0], detail.sessions[1]?.events[0]];
  assert.equal(opened?.action, 'Impression');
  assert.equal(opened?.surface, 'Buy');
  assert.equal(opened?.title, 'Omega Speedmaster');
  assert.equal(opened?.dealerName, 'Vault');
  assert.equal(opened?.priceCents, 1250000);
  assert.equal(opened?.thumbPath, 'photos/l1.jpg');
  assert.equal(passed?.action, 'Pass');
  assert.equal(passed?.surface, 'Listing');
  assert.equal(passed?.dwellMs, 4000);
  assert.equal(passed?.photoIndex, 2);
  assert.equal(passed?.filter, '"speedmaster"');
});
