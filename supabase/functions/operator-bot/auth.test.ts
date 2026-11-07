import { assertEquals } from 'jsr:@std/assert@1';

import { configuredSecret, offeredSecret, secretMatches } from './auth.ts';

const SECRET = 'sb_secret_test_operator';

function request(headers: Record<string, string>) {
  return new Request('http://127.0.0.1/functions/v1/operator-bot', { headers });
}

Deno.test('the bearer token is the offered secret', () => {
  const req = request({ authorization: `Bearer ${SECRET}`, apikey: 'other' });
  assertEquals(offeredSecret(req), SECRET);
});

Deno.test('an empty bearer falls back to apikey', () => {
  const missing = request({ apikey: SECRET });
  assertEquals(offeredSecret(missing), SECRET);
  const blank = request({ authorization: 'Bearer ', apikey: SECRET });
  assertEquals(offeredSecret(blank), SECRET);
});

Deno.test('an unset or blank function secret is not configured', () => {
  assertEquals(configuredSecret({ get: () => undefined }), null);
  assertEquals(configuredSecret({ get: () => '   ' }), null);
  assertEquals(configuredSecret({ get: () => SECRET }), SECRET);
});

Deno.test('only the same secret matches, including JWT-shaped tokens', async () => {
  assertEquals(await secretMatches(SECRET, SECRET), true);
  assertEquals(await secretMatches('sb_secret_wrong', SECRET), false);
  assertEquals(await secretMatches('', SECRET), false);
  assertEquals(
    await secretMatches(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig',
      SECRET,
    ),
    false,
  );
  assertEquals(
    await secretMatches(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6InVzZXIifQ.sig',
      SECRET,
    ),
    false,
  );
  assertEquals(
    await secretMatches(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig',
      SECRET,
    ),
    false,
  );
});
