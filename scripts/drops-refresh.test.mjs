import assert from 'node:assert/strict';
import { test } from 'node:test';

import { explainTokenGap, interpretDrops, tokenGapLine } from './drops-refresh.mjs';

const skips = {
  noToken: 1,
  noTokenWithListings: 1,
  alreadyToday: 0,
  nothingNew: 0,
  noApprovedFollow: 0,
};

test('a 404 fails the job and says the function is not deployed', () => {
  const outcome = interpretDrops(404, { error: 'requested function was not found' });
  assert.equal(outcome.fail, true);
  assert.match(outcome.lines[0], /Drops failed \(404\)/);
  assert.match(outcome.lines.join('\n'), /not deployed/);
});

test('a 401 and a 503 name the secret, and a network miss fails too', () => {
  assert.match(interpretDrops(401, { error: 'Not authorized.' }).lines.join('\n'), /cron secret/);
  assert.match(interpretDrops(503, { error: 'Drops are not configured.' }).lines.join('\n'), /GRAHAM_CRON_SECRET/);
  const down = interpretDrops(0, 'The operation was aborted due to timeout');
  assert.equal(down.fail, true);
  assert.match(down.lines[0], /no response/);
});

test('nobody selected is not a failure, and the skip counts are printed', () => {
  const outcome = interpretDrops(200, {
    users: 0,
    sent: 0,
    failed: 0,
    tokensRemoved: 0,
    alreadyClaimed: 0,
    skipped: skips,
    tokensOnFollowers: 0,
    tokensOnOtherAccounts: 1,
    problems: [],
  });
  assert.equal(outcome.fail, false);
  assert.equal(outcome.needsGap, false);
  assert.equal(outcome.warn, true);
  assert.match(outcome.lines.join('\n'), /0 sent/);
  assert.match(outcome.lines.join('\n'), /1 follower\(s\) had new watches but no push token/);
  assert.match(outcome.lines.join('\n'), /1 account\(s\) that follow nobody/);
});

test('an older function that only returns zeros still asks for the token gap', () => {
  const outcome = interpretDrops(200, { users: 0, sent: 0, failed: 0, tokensRemoved: 0 });
  assert.equal(outcome.fail, false);
  assert.equal(outcome.needsGap, true);
  assert.equal(outcome.warn, false);
});

test('a send does not warn', () => {
  const outcome = interpretDrops(200, {
    users: 1,
    sent: 1,
    failed: 0,
    tokensRemoved: 0,
    skipped: { noToken: 0, noTokenWithListings: 0, alreadyToday: 0, nothingNew: 0, noApprovedFollow: 0 },
    tokensOnFollowers: 1,
    tokensOnOtherAccounts: 0,
    problems: [],
  });
  assert.equal(outcome.fail, false);
  assert.equal(outcome.warn, false);
  assert.match(outcome.lines[0], /1 sent/);
});

test('a delivery or insert failure fails the job after the catalogue write', () => {
  const outcome = interpretDrops(200, {
    users: 1,
    sent: 0,
    failed: 1,
    tokensRemoved: 0,
    skipped: { ...skips, noToken: 0, noTokenWithListings: 0 },
    problems: ['42501 row-level security refused the insert'],
  });
  assert.equal(outcome.fail, true);
  assert.match(outcome.lines.join('\n'), /row-level security/);
  assert.match(outcome.lines.join('\n'), /this job is red/);
});

test('a non-JSON success body fails the job', () => {
  const outcome = interpretDrops(200, 'ok');
  assert.equal(outcome.fail, true);
});

test('the token gap counts followers and token holders separately', () => {
  const gap = explainTokenGap(['follower'], ['someone-else', 'someone-else']);
  assert.deepEqual(gap, { followers: 1, followersWithToken: 0, tokensWithoutFollow: 1 });
  assert.match(tokenGapLine(gap), /1 follower account/);
  assert.match(tokenGapLine(gap), /0 of them have a push token/);
  assert.match(tokenGapLine(gap), /1 push-token account/);

  const same = explainTokenGap(['ada', 'ada'], ['ada']);
  assert.deepEqual(same, { followers: 1, followersWithToken: 1, tokensWithoutFollow: 0 });
});
