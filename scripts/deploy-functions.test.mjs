import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  PROJECT_REF,
  deployArgs,
  deployAuthFailure,
  importListingsKeepsJwt,
  probeManagementApi,
  selectFunctions,
} from './deploy-functions.mjs';

const FUNCTIONS = [
  'claim-dealer',
  'import-listings',
  'inquiry-draft',
  'send-inquiry',
  'verify-application',
];

test('the hosted project ref is the one the refresh job already calls', () => {
  assert.equal(PROJECT_REF, 'hbxgxtbtefpyutyqafoi');
});

test('a change inside one function deploys only that function', () => {
  assert.deepEqual(
    selectFunctions(['supabase/functions/import-listings/index.ts'], FUNCTIONS),
    ['import-listings']
  );
});

test('a test, an env example, or an unrelated file deploys nothing', () => {
  assert.deepEqual(
    selectFunctions(
      [
        'supabase/functions/import-listings/shopify.test.ts',
        'supabase/functions/.env.example',
        'docs/OPERATING.md',
      ],
      FUNCTIONS
    ),
    []
  );
});

test('shared code or config.toml deploys every function', () => {
  assert.deepEqual(
    selectFunctions(['supabase/functions/_shared/mailer.ts'], FUNCTIONS),
    FUNCTIONS
  );
  assert.deepEqual(selectFunctions(['supabase/config.toml'], FUNCTIONS), FUNCTIONS);
});

test('an unknown diff deploys every function', () => {
  assert.deepEqual(selectFunctions(null, FUNCTIONS), FUNCTIONS);
});

test('deploy args keep JWT verification on and name the project', () => {
  const args = deployArgs('import-listings');
  assert.deepEqual(args, [
    'functions',
    'deploy',
    'import-listings',
    '--project-ref',
    'hbxgxtbtefpyutyqafoi',
  ]);
  assert.equal(args.includes('--no-verify-jwt'), false);
});

test('a rejected access token names the secret to replace', () => {
  const message = deployAuthFailure(401, '{"message":"Invalid access token"}');
  assert.match(message, /SUPABASE_ACCESS_TOKEN/);
  assert.match(message, /401 Invalid access token/);
  assert.match(message, /hbxgxtbtefpyutyqafoi/);
  assert.match(message, /Re-run Deploy edge functions/);
  assert.equal(deployAuthFailure(500, 'boom'), null);
});

test('the CLI phrase is enough when the status is not 401', () => {
  const message = deployAuthFailure(0, 'unexpected list functions status 401: {"message":"Invalid access token"}');
  assert.match(message, /SUPABASE_ACCESS_TOKEN/);
});

test('a token with no access to the project is a different sentence', () => {
  const message = deployAuthFailure(403, '{"message":"Forbidden"}');
  assert.match(message, /403/);
  assert.match(message, /does not have access/);
});

test('the management probe reports the status and does not send the token anywhere else', async () => {
  let seen = null;
  const result = await probeManagementApi('test-token', async (url, init) => {
    seen = { url, authorization: init.headers.Authorization };
    return { ok: false, status: 401, text: async () => '{"message":"Invalid access token"}' };
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.body, /Invalid access token/);
  assert.equal(seen.url, 'https://api.supabase.com/v1/projects/hbxgxtbtefpyutyqafoi/functions');
  assert.equal(seen.authorization, 'Bearer test-token');
});

test('import-listings is pinned to verify_jwt true in config.toml', () => {
  const config = readFileSync('supabase/config.toml', 'utf8');
  assert.equal(importListingsKeepsJwt(config), true);
  assert.equal(
    importListingsKeepsJwt('[functions.import-listings]\nverify_jwt = false\n'),
    false
  );
  assert.equal(importListingsKeepsJwt('# no function block\n'), false);
});
