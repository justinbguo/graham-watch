import { assertEquals } from 'jsr:@std/assert@1';

import { FixtureImportOff, handleOperatorRequest, type AuditRow, type OperatorDeps } from './handler.ts';

const SECRET = 'sb_secret_test_operator';

function request(body: unknown, token: string | null = SECRET, method = 'POST') {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://127.0.0.1/functions/v1/operator-bot', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function deps(overrides: Partial<OperatorDeps> = {}) {
  const calls: string[] = [];
  const audits: unknown[] = [];
  const base: OperatorDeps = {
    env: { get: (name) => (name === 'GRAHAM_OPERATOR_SECRET' ? SECRET : undefined) },
    discover: async (domain) => {
      calls.push(`discover:${domain}`);
      return { catalogUrl: `${domain}/watches`, platform: 'fixture' };
    },
    inspect: async (sourceUrl) => {
      calls.push(`inspect:${sourceUrl}`);
      return { counts: { read: 2, for_sale: 1, sold: 1, skipped: 0 } };
    },
    importCatalog: async (input) => {
      calls.push(`catalog:${input.sourceUrl}`);
      return { dealerId: '11111111-1111-4111-8111-111111111111', permission: 'pending', found: 3 };
    },
    importFixture: async (input) => {
      calls.push(`fixture:${input.sourceUrl}:${input.listings.length}`);
      return {
        dealerId: '22222222-2222-4222-8222-222222222222',
        permission: 'pending',
        published: input.listings.length,
      };
    },
    setPermission: async (dealerId, permission) => {
      calls.push(`permission:${dealerId}:${permission}`);
      return { dealerId, permission };
    },
    report: async (dealerId) => {
      calls.push(`report:${dealerId}`);
      return {
        dealerId,
        permission: 'pending',
        listings: { active: 1, total: 1 },
        latestJob: { status: 'succeeded' },
      };
    },
    audit: async (row) => {
      audits.push(row);
    },
    ...overrides,
  };
  return { deps: base, calls, audits };
}

const shop = 'https://bot-proof.graham.test/watches';
const dealer = '33333333-3333-4333-8333-333333333333';

Deno.test('the secret runs discover, inspect, import, approve, unapprove, and report', async () => {
  const harness = deps();
  const discover = await handleOperatorRequest(
    request({ action: 'discover', domain: 'bot-proof.graham.test' }),
    harness.deps,
  );
  assertEquals(discover.status, 200);
  assertEquals((await discover.json()).catalogUrl, 'https://bot-proof.graham.test/watches');

  const inspect = await handleOperatorRequest(
    request({ action: 'inspect', sourceUrl: shop }),
    harness.deps,
  );
  assertEquals(inspect.status, 200);
  assertEquals((await inspect.json()).counts.for_sale, 1);

  const preview = await handleOperatorRequest(
    request({ action: 'preview', sourceUrl: shop }),
    harness.deps,
  );
  assertEquals(preview.status, 200);

  const imported = await handleOperatorRequest(
    request({ action: 'import', sourceUrl: shop, dealerName: 'Bot Proof' }),
    harness.deps,
  );
  assertEquals(imported.status, 200);
  assertEquals((await imported.json()).permission, 'pending');

  const fixture = await handleOperatorRequest(
    request({
      action: 'import',
      sourceUrl: shop,
      listings: [{
        brand: 'Bot Proof',
        model: 'Secret Door',
        source_url: 'https://bot-proof.graham.test/watches/secret-door',
      }],
    }),
    harness.deps,
  );
  assertEquals(fixture.status, 200);
  assertEquals((await fixture.json()).published, 1);

  const approved = await handleOperatorRequest(
    request({ action: 'approve', dealerId: dealer }),
    harness.deps,
  );
  assertEquals(approved.status, 200);
  assertEquals((await approved.json()).permission, 'approved');

  const unapproved = await handleOperatorRequest(
    request({ action: 'unapprove', dealerId: dealer }),
    harness.deps,
  );
  assertEquals(unapproved.status, 200);
  assertEquals((await unapproved.json()).permission, 'pending');

  const report = await handleOperatorRequest(
    request({ action: 'report', dealerId: dealer }),
    harness.deps,
  );
  assertEquals(report.status, 200);
  assertEquals((await report.json()).listings.active, 1);

  assertEquals(harness.calls, [
    'discover:https://bot-proof.graham.test',
    `inspect:${shop}`,
    `inspect:${shop}`,
    `catalog:${shop}`,
    `fixture:${shop}:1`,
    `permission:${dealer}:approved`,
    `permission:${dealer}:pending`,
    `report:${dealer}`,
  ]);
  assertEquals(
    harness.audits.map((row) => {
      const audit = row as AuditRow;
      return { action: audit.action, targetId: audit.targetId };
    }),
    [
      { action: 'discover_shop', targetId: null },
      { action: 'inspect_shop', targetId: null },
      { action: 'inspect_shop', targetId: null },
      { action: 'import_shop', targetId: '11111111-1111-4111-8111-111111111111' },
      { action: 'import_shop', targetId: '22222222-2222-4222-8222-222222222222' },
      { action: 'read_shop', targetId: dealer },
    ],
  );
});

Deno.test('a wrong key, an anon key, a user token, and a service-role JWT do nothing', async () => {
  const tokens = [
    'sb_secret_wrong',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6InVzZXIifQ.sig',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig',
    '',
  ];
  for (const token of tokens) {
    const harness = deps();
    const response = await handleOperatorRequest(
      request({ action: 'approve', dealerId: dealer }, token || null),
      harness.deps,
    );
    assertEquals(response.status, 401);
    assertEquals((await response.json()).error, 'Not authorized.');
    assertEquals(harness.calls, []);
    assertEquals(harness.audits, []);
  }
});

Deno.test('a bearer that does not match is rejected even when apikey is the secret', async () => {
  const harness = deps();
  const headers = new Headers({
    authorization: 'Bearer sb_secret_wrong',
    apikey: SECRET,
    'content-type': 'application/json',
  });
  const response = await handleOperatorRequest(
    new Request('http://127.0.0.1/functions/v1/operator-bot', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'report', dealerId: dealer }),
    }),
    harness.deps,
  );
  assertEquals(response.status, 401);
  assertEquals(harness.calls, []);
});

Deno.test('apikey is accepted when Authorization is absent', async () => {
  const harness = deps();
  const headers = new Headers({ apikey: SECRET, 'content-type': 'application/json' });
  const response = await handleOperatorRequest(
    new Request('http://127.0.0.1/functions/v1/operator-bot', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'report', dealerId: dealer }),
    }),
    harness.deps,
  );
  assertEquals(response.status, 200);
  assertEquals(harness.calls, [`report:${dealer}`]);
});

Deno.test('an unset secret fails closed', async () => {
  const harness = deps({ env: { get: () => undefined } });
  const response = await handleOperatorRequest(
    request({ action: 'discover', domain: 'bot-proof.graham.test' }),
    harness.deps,
  );
  assertEquals(response.status, 503);
  assertEquals(harness.calls, []);
});

Deno.test('fixture import that is switched off writes nothing', async () => {
  const harness = deps({
    importFixture: async () => {
      throw new FixtureImportOff();
    },
  });
  const response = await handleOperatorRequest(
    request({
      action: 'import',
      sourceUrl: shop,
      listings: [{ brand: 'Bot Proof', source_url: 'https://bot-proof.graham.test/one' }],
    }),
    harness.deps,
  );
  assertEquals(response.status, 404);
  assertEquals((await response.json()).error.includes('Fixture import is off'), true);
  assertEquals(harness.audits, []);
});

Deno.test('anything but POST is refused', async () => {
  const harness = deps();
  const response = await handleOperatorRequest(
    request({ action: 'approve', dealerId: dealer }, SECRET, 'GET'),
    harness.deps,
  );
  assertEquals(response.status, 405);
  assertEquals(harness.calls, []);
  assertEquals(harness.audits, []);
});

Deno.test('a private URL, a bad id, and an unknown action are refused', async () => {
  const harness = deps();
  const local = await handleOperatorRequest(
    request({ action: 'inspect', sourceUrl: 'http://127.0.0.1/secret' }),
    harness.deps,
  );
  assertEquals(local.status, 400);
  const missing = await handleOperatorRequest(
    request({ action: 'approve', dealerId: 'not-a-uuid' }),
    harness.deps,
  );
  assertEquals(missing.status, 400);
  const unknown = await handleOperatorRequest(request({ action: 'delete-dealer' }), harness.deps);
  assertEquals(unknown.status, 400);
  assertEquals(harness.calls, []);
  assertEquals(harness.audits, []);
});
