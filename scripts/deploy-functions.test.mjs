import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  PROJECT_REF,
  deployArgs,
  importListingsKeepsJwt,
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

test('import-listings is pinned to verify_jwt true in config.toml', () => {
  const config = readFileSync('supabase/config.toml', 'utf8');
  assert.equal(importListingsKeepsJwt(config), true);
  assert.equal(
    importListingsKeepsJwt('[functions.import-listings]\nverify_jwt = false\n'),
    false
  );
  assert.equal(importListingsKeepsJwt('# no function block\n'), false);
});
