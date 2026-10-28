import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shopsToRefresh, summariseRefreshAll, type RefreshCandidate } from './refreshAllLogic.ts';

function shop(partial: Partial<RefreshCandidate> & Pick<RefreshCandidate, 'id' | 'name'>): RefreshCandidate {
  return {
    website: 'https://example.test',
    permission: 'approved',
    can_import: true,
    ...partial,
  };
}

test('shopsToRefresh keeps approved shops with a website and import permission', () => {
  const rows = [
    shop({ id: 'a', name: 'Alpha' }),
    shop({ id: 'b', name: 'Beta', permission: 'paused' }),
    shop({ id: 'c', name: 'Gamma', website: null }),
    shop({ id: 'd', name: 'Delta', can_import: false }),
  ];
  assert.deepEqual(shopsToRefresh(rows).map((row) => row.id), ['a']);
});

test('summariseRefreshAll counts successes, publishes, and failures', () => {
  const text = summariseRefreshAll([
    {
      id: 'a',
      name: 'Alpha',
      ok: true,
      publish: { processed: 1, published: 2, skipped: 0, failed: 0, pending: 1 },
    },
    { id: 'b', name: 'Beta', ok: false, error: 'nope' },
  ]);
  assert.match(text, /Synced 1 of 2/);
  assert.match(text, /2 listing\(s\) published/);
  assert.match(text, /1 still queued/);
  assert.match(text, /Beta/);
});
