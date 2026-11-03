import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DROP_MAX_AGE_DAYS,
  dropCopy,
  dropCutoff,
  selectDrops,
  utcDay,
  type DropFollow,
  type DropListing,
  type DropNotice,
  type DropToken,
} from '../supabase/functions/notify-drops/select.ts';
import { dropPushMessages, readTickets, ticketsFromExpoBody } from '../supabase/functions/notify-drops/expo.ts';
import { routeFromPushData } from '../src/lib/pushRoute.ts';

const NOW = new Date('2026-11-03T06:30:00.000Z');
const ADA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BEA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CRAFT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TAILORED = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const WATCH_NEW = '11111111-1111-1111-1111-111111111111';
const WATCH_OLD = '22222222-2222-2222-2222-222222222222';
const WATCH_SENT = '33333333-3333-3333-3333-333333333333';
const WATCH_OTHER = '44444444-4444-4444-4444-444444444444';

function follow(userId: string, dealerId: string, name: string, followedAt = '2026-11-01T00:00:00.000Z'): DropFollow {
  return { userId, dealerId, dealerName: name, followedAt, permission: 'approved' };
}

function listing(id: string, dealerId: string, createdAt: string, extra: Partial<DropListing> = {}): DropListing {
  return { id, dealerId, createdAt, status: 'active', soldAt: null, ...extra };
}

function token(userId: string, value = `ExponentPushToken[${userId.slice(0, 8)}]`): DropToken {
  return { userId, token: value };
}

function run(extra: {
  follows?: DropFollow[];
  listings?: DropListing[];
  notices?: DropNotice[];
  tokens?: DropToken[];
  now?: Date;
}) {
  return selectDrops({
    now: extra.now ?? NOW,
    follows: extra.follows ?? [],
    listings: extra.listings ?? [],
    notices: extra.notices ?? [],
    tokens: extra.tokens ?? [],
  });
}

test('utc day is the UTC calendar date', () => {
  assert.equal(utcDay(NOW), '2026-11-03');
  assert.equal(utcDay(new Date('2026-11-03T23:30:00.000Z')), '2026-11-03');
  assert.equal(utcDay(new Date('2026-11-04T00:30:00.000Z')), '2026-11-04');
});

test('one shop is named, several shops are counted', () => {
  assert.deepEqual(dropCopy([{ id: CRAFT, name: 'Craft + Tailored', count: 3 }]), {
    title: 'New watches',
    body: '3 new watches from Craft + Tailored',
    destination: 'dealer',
    dealerId: CRAFT,
  });
  assert.equal(
    dropCopy([{ id: CRAFT, name: 'Craft + Tailored', count: 1 }]).body,
    '1 new watch from Craft + Tailored',
  );
  assert.deepEqual(
    dropCopy([
      { id: CRAFT, name: 'Craft + Tailored', count: 3 },
      { id: TAILORED, name: 'Tailored', count: 2 },
    ]),
    {
      title: 'New watches',
      body: '5 new watches from 2 dealers you follow',
      destination: 'drops',
      dealerId: null,
    },
  );
});

test('a follower with a token is notified about watches listed after the follow', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [
      listing(WATCH_OLD, CRAFT, '2026-10-01T00:00:00.000Z'),
      listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z'),
    ],
    tokens: [token(ADA)],
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.userId, ADA);
  assert.deepEqual(plans[0]!.listingIds, [WATCH_NEW]);
  assert.equal(plans[0]!.body, '1 new watch from Craft + Tailored');
  assert.equal(plans[0]!.destination, 'dealer');
  assert.equal(plans[0]!.dealerId, CRAFT);
  assert.equal(plans[0]!.notifiedThrough, '2026-11-03T02:00:00.000Z');
});

test('someone who does not follow the shop is left out', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [listing(WATCH_NEW, TAILORED, '2026-11-03T02:00:00.000Z')],
    tokens: [token(ADA), token(BEA)],
  });
  assert.deepEqual(plans, []);
});

test('a watch listed before the follow is not a drop', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored', '2026-11-03T04:00:00.000Z')],
    listings: [listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z')],
    tokens: [token(ADA)],
  });
  assert.deepEqual(plans, []);
});

test('sold, hidden, and paused shops are not announced', () => {
  const plans = run({
    follows: [
      follow(ADA, CRAFT, 'Craft + Tailored'),
      { ...follow(ADA, TAILORED, 'Paused'), permission: 'paused' },
    ],
    listings: [
      listing(WATCH_OLD, CRAFT, '2026-11-03T02:00:00.000Z', { soldAt: '2026-11-03T03:00:00.000Z' }),
      listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z', { status: 'hidden' }),
      listing(WATCH_OTHER, TAILORED, '2026-11-03T02:00:00.000Z'),
    ],
    tokens: [token(ADA)],
  });
  assert.deepEqual(plans, []);
});

test('no token means no push, even when there is something new', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z')],
    tokens: [],
  });
  assert.deepEqual(plans, []);
});

test('a watch already on a sent or pending notice is not sent again', () => {
  const sent: DropNotice = {
    userId: ADA,
    notifiedOn: '2026-11-02',
    status: 'sent',
    listingIds: [WATCH_SENT],
  };
  const pending: DropNotice = {
    userId: ADA,
    notifiedOn: '2026-11-01',
    status: 'pending',
    listingIds: [WATCH_OLD],
  };
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [
      listing(WATCH_SENT, CRAFT, '2026-11-02T02:00:00.000Z'),
      listing(WATCH_OLD, CRAFT, '2026-11-01T02:00:00.000Z'),
      listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z'),
    ],
    notices: [sent, pending],
    tokens: [token(ADA)],
  });
  assert.deepEqual(plans[0]!.listingIds, [WATCH_NEW]);
});

test('a failed send does not consume the watch, so the next day can retry it', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [listing(WATCH_NEW, CRAFT, '2026-11-02T02:00:00.000Z')],
    notices: [
      {
        userId: ADA,
        notifiedOn: '2026-11-02',
        status: 'failed',
        listingIds: [WATCH_NEW],
      },
    ],
    tokens: [token(ADA)],
  });
  assert.deepEqual(plans[0]!.listingIds, [WATCH_NEW]);
});

test('one push per buyer per UTC day, even when more watches arrived', () => {
  const plans = run({
    follows: [
      follow(ADA, CRAFT, 'Craft + Tailored'),
      follow(BEA, CRAFT, 'Craft + Tailored'),
    ],
    listings: [listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z')],
    notices: [
      {
        userId: ADA,
        notifiedOn: '2026-11-03',
        status: 'sent',
        listingIds: [WATCH_SENT],
      },
    ],
    tokens: [token(ADA), token(BEA)],
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.userId, BEA);
});

test('a failed attempt today still uses the daily slot', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [listing(WATCH_NEW, CRAFT, '2026-11-03T05:00:00.000Z')],
    notices: [
      {
        userId: ADA,
        notifiedOn: '2026-11-03',
        status: 'failed',
        listingIds: [WATCH_OLD],
      },
    ],
    tokens: [token(ADA)],
  });
  assert.deepEqual(plans, []);
});

test('two shops collapse into one message and open the feed', () => {
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored'), follow(ADA, TAILORED, 'Second')],
    listings: [
      listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z'),
      listing(WATCH_OTHER, CRAFT, '2026-11-03T01:00:00.000Z'),
      listing(WATCH_SENT, TAILORED, '2026-11-03T03:00:00.000Z'),
    ],
    tokens: [token(ADA), token(ADA, 'ExponentPushToken[secondphone]')],
  });
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.body, '3 new watches from 2 dealers you follow');
  assert.equal(plans[0]!.destination, 'drops');
  assert.equal(plans[0]!.dealerId, null);
  assert.deepEqual(plans[0]!.listingIds, [WATCH_SENT, WATCH_NEW, WATCH_OTHER]);
  assert.deepEqual(plans[0]!.dealerIds, [CRAFT, TAILORED].sort());
});

test('an old follower first push is only the last 14 days, including the boundary', () => {
  assert.equal(DROP_MAX_AGE_DAYS, 14);
  const cutoff = new Date(dropCutoff(NOW)).toISOString();
  const justOlder = new Date(dropCutoff(NOW) - 1).toISOString();
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored', '2020-01-01T00:00:00.000Z')],
    listings: [
      listing(WATCH_OLD, CRAFT, '2024-06-01T00:00:00.000Z'),
      listing(WATCH_SENT, CRAFT, justOlder),
      listing(WATCH_NEW, CRAFT, cutoff),
      listing(WATCH_OTHER, CRAFT, '2026-11-02T06:30:00.000Z'),
    ],
    tokens: [token(ADA)],
  });
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.listingIds, [WATCH_OTHER, WATCH_NEW]);
  assert.equal(plans[0]!.body, '2 new watches from Craft + Tailored');
});

test('the same listing id twice is one watch', () => {
  const row = listing(WATCH_NEW, CRAFT, '2026-11-03T02:00:00.000Z');
  const plans = run({
    follows: [follow(ADA, CRAFT, 'Craft + Tailored')],
    listings: [row, { ...row }],
    tokens: [token(ADA)],
  });
  assert.deepEqual(plans[0]!.listingIds, [WATCH_NEW]);
  assert.equal(plans[0]!.body, '1 new watch from Craft + Tailored');
});

test('expo tickets name DeviceNotRegistered and leave other errors alone', () => {
  const tokens = ['good', 'dead', 'limited'];
  const reading = readTickets(tokens, [
    { status: 'ok', id: 'ticket-1' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
  ]);
  assert.deepEqual(reading, { okIds: ['ticket-1'], deadTokens: ['dead'], anyOk: true });
  assert.equal(ticketsFromExpoBody({ data: [{ status: 'ok' }] })?.length, 1);
  assert.equal(ticketsFromExpoBody([{ status: 'ok' }])?.length, 1);
  assert.equal(ticketsFromExpoBody({ data: 'nope' }), null);
});

test('a single-shop push names that shop, and a feed push does not', () => {
  const one = dropPushMessages({
    tokens: ['ExponentPushToken[one]'],
    title: 'New watches',
    body: '1 new watch from Craft + Tailored',
    notificationId: WATCH_NEW,
    dealerId: CRAFT,
  });
  assert.equal(one[0]!.data.dealerId, CRAFT);
  assert.equal(one[0]!.data.kind, 'drop');
  assert.equal(one[0]!.channelId, 'watch-updates');

  const many = dropPushMessages({
    tokens: ['ExponentPushToken[one]', 'ExponentPushToken[two]'],
    title: 'New watches',
    body: '5 new watches from 2 dealers you follow',
    notificationId: WATCH_OLD,
    dealerId: null,
  });
  assert.equal('dealerId' in many[0]!.data, false);
  assert.equal(many.length, 2);
});

test('a drop tap opens the shop or the feed, and a reply still opens the thread', () => {
  assert.deepEqual(
    routeFromPushData({ kind: 'drop', dropNotificationId: WATCH_NEW, dealerId: CRAFT }),
    { type: 'drop', dropNotificationId: WATCH_NEW, dealerId: CRAFT },
  );
  assert.deepEqual(routeFromPushData({ kind: 'drop', dropNotificationId: WATCH_NEW }), {
    type: 'drop',
    dropNotificationId: WATCH_NEW,
    dealerId: null,
  });
  assert.equal(routeFromPushData({ kind: 'drop', dropNotificationId: 'nope' }), null);
  assert.deepEqual(routeFromPushData({ conversationId: 'thread-1' }), {
    type: 'conversation',
    conversationId: 'thread-1',
  });
  assert.equal(routeFromPushData(null), null);
});
