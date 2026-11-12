import assert from 'node:assert/strict';
import test from 'node:test';

import { unseenNewCount } from '../src/data/newBatchCount.ts';

test('a batch the device has not opened shows its size', () => {
  assert.equal(unseenNewCount({ id: 'batch-a', size: 4 }, null), 4);
  assert.equal(unseenNewCount({ id: 'batch-b', size: 1 }, 'batch-a'), 1);
});

test('opening that batch clears the count, including an empty seal', () => {
  assert.equal(unseenNewCount({ id: 'batch-a', size: 4 }, 'batch-a'), 0);
  assert.equal(unseenNewCount({ id: 'batch-a', size: 0 }, null), 0);
  assert.equal(unseenNewCount(null, null), 0);
});
