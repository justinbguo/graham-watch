import assert from 'node:assert/strict';
import test from 'node:test';

import { communityPosts } from '../src/data/communityFeed.ts';

test('a second community load does not grow fixture posts', () => {
  const live = [{ id: 'post-1' }];
  const fixtures = [{ id: 'showcase:sell' }, { id: 'showcase:buy' }];
  const first = communityPosts(live, fixtures, false);
  const second = communityPosts(first, fixtures, false);
  assert.deepEqual(first, live);
  assert.deepEqual(second, live);
  assert.equal(second.length, 1);
  assert.deepEqual(communityPosts(live, fixtures, true), fixtures);
});
