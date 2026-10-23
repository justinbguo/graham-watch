import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  barShare,
  formatDuration,
  formatPercent,
  labelAnswer,
  parseDashboard,
  parseUserDetail,
} from './dashboard.ts';

test('a partial payload still draws empty charts', () => {
  const dash = parseDashboard({ totals: { users: 4, onboarded: 1, onboarding_rate: 0.25 } });
  assert.equal(dash.totals.users, 4);
  assert.equal(dash.totals.onboarding_rate, 0.25);
  assert.deepEqual(dash.signupsByDay, []);
  assert.deepEqual(dash.onboarding.favoriteBrands, []);
  assert.equal(dash.funnel.feeCents, 0);
});

test('rollups and the funnel keep the names the database used', () => {
  const dash = parseDashboard({
    onboarding: { collection_size: [{ value: 'two_to_three', count: 3 }] },
    funnel: {
      inquiries: 2,
      conversations: 1,
      messages: 4,
      fee_cents: 5000,
      deals: [{ status: 'completed', count: 1, fee_cents: 5000 }],
    },
    dealer_response: [
      {
        dealer_id: 'd1',
        name: 'Vault',
        threads: 4,
        answered: 2,
        response_rate: 0.5,
        median_response_seconds: 7200,
      },
    ],
  });
  assert.equal(dash.onboarding.collectionSize[0]?.value, 'two_to_three');
  assert.equal(dash.funnel.deals[0]?.status, 'completed');
  assert.equal(dash.dealerResponse[0]?.medianResponseSeconds, 7200);
  assert.equal(labelAnswer('two_to_three'), '2–3');
  assert.equal(formatPercent(0.5), '50%');
  assert.equal(formatDuration(7200), '2h');
});

test('a drill-in keeps onboarding answers and saves, and no email field is required', () => {
  const detail = parseUserDetail({
    id: 'u1',
    handle: 'ada',
    first_name: 'Ada',
    account_type: 'buyer',
    onboarded: true,
    favorite_brands: ['Omega'],
    hunting_for: ['sports'],
    collection_size: 'one',
    collecting_years: 'under_a_year',
    search_pain_points: ['buying_online'],
    saves: [{ listing_id: 'l1', brand: 'Omega', model: 'Speedmaster', dealer_name: 'Vault', saved_at: '2026-10-01' }],
    follows: [],
  });
  assert.equal(detail.favoriteBrands[0], 'Omega');
  assert.equal(detail.saves[0]?.brand, 'Omega');
  assert.equal('email' in detail, false);
});

test('an empty bar is zero height and a full bar is the track', () => {
  assert.equal(barShare(0, 10), 0);
  assert.equal(barShare(10, 10), 100);
  assert.equal(barShare(5, 0), 0);
});
