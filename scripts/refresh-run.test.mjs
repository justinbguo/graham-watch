import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatShop, refreshDealer, refreshFailureReason, runRefresh, SYNC_PAGE_BUDGET } from './refresh-run.mjs';

const GOLD = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Goldfingers',
  website: 'https://goldfingersvintage.com',
};
const OLD = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Old School Seconds',
  website: 'https://oldschoolseconds.com',
};

function syncResponse(fields) {
  return {
    ok: true,
    status: 200,
    body: {
      bounded: true,
      phase: 'sync',
      results: [
        {
          ok: true,
          found: 0,
          changed: 0,
          added: 0,
          retired: 0,
          relisted: 0,
          published: 0,
          pending: 0,
          complete: true,
          ...fields,
        },
      ],
    },
  };
}

test('a shop with nothing to publish is one catalogue read and no model calls', async () => {
  const calls = [];
  const shop = await refreshDealer(GOLD, async (body) => {
    calls.push(body);
    return syncResponse({
      website: GOLD.website,
      name: GOLD.name,
      found: 569,
      changed: 0,
      pending: 0,
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].dealerId, GOLD.id);
  assert.equal(calls[0].phase, 'sync');
  assert.equal(calls[0].page, 1);
  assert.equal(calls[0].pageBudget, SYNC_PAGE_BUDGET);
  assert.equal(typeof calls[0].readAt, 'string');
  assert.equal(shop.ok, true);
  assert.equal(shop.published, 0);
  assert.equal(shop.pending, 0);
  assert.deepEqual(formatShop(shop), [
    'https://goldfingersvintage.com',
    '  read 569, 0 changed, 0 new, 0 retired, 0 relisted, 0 published',
  ]);
});

test('dry-run: each shop is its own calls, and a backlog is published a slice at a time', async () => {
  const calls = [];
  let pending = 4;
  const { results, exitCode } = await runRefresh([GOLD, OLD], async (body) => {
    calls.push({ ...body });
    if (body.dealerId === GOLD.id) {
      return syncResponse({ website: GOLD.website, found: 569, changed: 0, pending: 0 });
    }
    if (body.phase === 'sync') {
      return syncResponse({ website: OLD.website, found: 80, changed: 4, pending: 4 });
    }
    pending -= 2;
    return {
      ok: true,
      status: 200,
      body: {
        bounded: true,
        phase: 'publish',
        results: [{ ok: true, published: 2, processed: 2, pending }],
      },
    };
  });

  assert.deepEqual(
    calls.map((call) => `${call.dealerId.slice(0, 8)}:${call.phase}`),
    [`${GOLD.id.slice(0, 8)}:sync`, `${OLD.id.slice(0, 8)}:sync`, `${OLD.id.slice(0, 8)}:publish`, `${OLD.id.slice(0, 8)}:publish`]
  );
  assert.equal(calls.some((call) => !call.dealerId), false);
  assert.equal(exitCode, 0);
  assert.equal(results[0].found, 569);
  assert.equal(results[1].published, 4);
  assert.equal(results[1].pending, 0);
});

test('a 546 on one shop is logged and the next shop still runs', async () => {
  const calls = [];
  const { results, exitCode } = await runRefresh([OLD, GOLD], async (body) => {
    calls.push(body.dealerId);
    if (body.dealerId === OLD.id) {
      return {
        ok: false,
        status: 546,
        body: {
          code: 'WORKER_RESOURCE_LIMIT',
          message: 'Function failed due to not having enough compute resources',
        },
      };
    }
    return syncResponse({ website: GOLD.website, found: 569, pending: 0 });
  });

  assert.deepEqual(calls, [OLD.id, GOLD.id]);
  assert.equal(exitCode, 0);
  assert.equal(results[0].ok, false);
  assert.match(results[0].error, /HTTP 546/);
  assert.equal(results[1].ok, true);
  assert.deepEqual(formatShop(results[0]).slice(1), [
    '  failed: Function failed due to not having enough compute resources (HTTP 546)',
  ]);
});

test('every shop failing the catalogue read fails the job', async () => {
  const { exitCode } = await runRefresh([GOLD, OLD], async () => ({
    ok: false,
    status: 546,
    body: { message: 'CPU Time exceeded' },
  }));
  assert.equal(exitCode, 1);
});

test('a rejected key stops the run before the next shop', async () => {
  const calls = [];
  const { results, exitCode } = await runRefresh([OLD, GOLD], async (body) => {
    calls.push(body);
    if (body.phase === 'sync') {
      return syncResponse({ website: OLD.website, pending: 2 });
    }
    return { ok: false, status: 503, body: { error: 'OPENAI_API_KEY is not set.' } };
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].phase, 'publish');
  assert.equal(results.length, 1);
  assert.equal(results[0].fatal, true);
  assert.equal(results[0].ok, true);
  assert.equal(exitCode, 1);
  assert.equal(refreshFailureReason(results), 'OPENAI_API_KEY is not set. (HTTP 503)');
});

test('an older function that already drained the shop is not asked to publish again', async () => {
  const calls = [];
  await refreshDealer(OLD, async (body) => {
    calls.push(body.phase);
    return {
      ok: true,
      status: 200,
      body: {
        results: [{ ok: true, found: 10, pending: 10, published: 10, complete: true }],
      },
    };
  });
  assert.deepEqual(calls, ['sync']);
});

test('a publish slice that moves nothing is not retried in a loop', async () => {
  let publishes = 0;
  const shop = await refreshDealer(OLD, async (body) => {
    if (body.phase === 'sync') return syncResponse({ pending: 6, found: 6, changed: 6 });
    publishes += 1;
    return {
      ok: true,
      status: 200,
      body: { bounded: true, results: [{ ok: true, published: 0, processed: 0, pending: 6 }] },
    };
  });
  assert.equal(publishes, 1);
  assert.equal(shop.pending, 6);
  assert.match(formatShop(shop).at(-1), /6 still waiting/);
});

test('catalogue skips and publish skips add up on the shop', async () => {
  const shop = await refreshDealer(OLD, async (body) => {
    if (body.phase === 'sync') return syncResponse({ found: 8, pending: 2, skipped: 3 });
    return {
      ok: true,
      status: 200,
      body: { bounded: true, results: [{ ok: true, published: 1, skipped: 1, processed: 2, pending: 0 }] },
    };
  });
  assert.equal(shop.listingsSkipped, 4);
  assert.equal(shop.published, 1);
  assert.match(formatShop(shop)[1], /1 published, 4 skipped/);
});

test('the per-night cap leaves the rest of the queue for the next run', async () => {
  let publishes = 0;
  const shop = await refreshDealer(
    OLD,
    async (body) => {
      if (body.phase === 'sync') return syncResponse({ pending: 100, found: 100, changed: 100 });
      publishes += 1;
      return {
        ok: true,
        status: 200,
        body: {
          bounded: true,
          results: [{ ok: true, published: 2, processed: 2, pending: 100 - publishes * 2 }],
        },
      };
    },
    2
  );
  assert.equal(publishes, 2);
  assert.equal(shop.published, 4);
  assert.equal(shop.pending, 96);
  assert.equal(shop.ok, true);
});

test('a catalogue that names a next page is read again before anything is published', async () => {
  const calls = [];
  let firstReadAt = null;
  const shop = await refreshDealer(OLD, async (body) => {
    calls.push(body.phase === 'sync' ? body.page : body.phase);
    if (body.phase === 'sync' && body.page === 1) {
      firstReadAt = body.readAt;
      return syncResponse({
        found: 10,
        added: 10,
        pending: 0,
        complete: false,
        nextPage: 9,
        carry: { found: 10, added: 10, changed: 0, retired: 0, relisted: 0, skipped: 0 },
      });
    }
    if (body.phase === 'sync') {
      assert.equal(body.page, 9);
      assert.equal(body.readAt, firstReadAt);
      assert.equal(body.carry.found, 10);
      return syncResponse({ found: 14, added: 11, pending: 2, complete: true });
    }
    return {
      ok: true,
      status: 200,
      body: { bounded: true, results: [{ ok: true, published: 2, processed: 2, pending: 0 }] },
    };
  });

  assert.deepEqual(calls, [1, 9, 'publish']);
  assert.equal(shop.found, 14);
  assert.equal(shop.published, 2);
});

test('a revoked shop the function refuses is not a failed refresh', async () => {
  const shop = await refreshDealer(OLD, async () => ({
    ok: true,
    status: 200,
    body: { bounded: true, shops: 0, results: [] },
  }));
  assert.equal(shop.ok, true);
  assert.equal(shop.skipped, true);
  assert.match(formatShop(shop)[1], /not an approved shop/);
});
