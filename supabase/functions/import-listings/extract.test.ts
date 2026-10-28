import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import {
  ExtractorUnavailable,
  OPENAI_MAX_ATTEMPTS,
  OPENAI_MAX_DELAY_MS,
  extractFields,
  openAIConcurrencyLimit,
  openAIFailureKind,
  openAIRetryDelayMs,
  retryHintMs,
  setOpenAIClientForTests,
} from './extract.ts';

// The body from the nightly run that failed oldschoolseconds.com: RPM 10,
// and the only wait hint OpenAI gave was this sentence.
const INCIDENT =
  'Rate limit reached for gpt-4o-mini in organization org-test on requests per min (RPM): Limit 10, Used 10, Requested 1. Please try again in 6s. Visit https://platform.openai.com/account/rate-limits to learn more. {"error":{"code":"rate_limit_exceeded"}}';

const NOW = Date.parse('2026-10-23T15:00:00.000Z');

function chatOk(brand = 'Rolex') {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ brand }) } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function errorResponse(status: number, body: string, headers: HeadersInit = {}) {
  return new Response(body, { status, headers });
}

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(times = 50) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

/* --------------------------------------------------------------- hints */

Deno.test('reads the "try again in 6s" hint from a 429 body', () => {
  assertEquals(retryHintMs(null, INCIDENT, NOW), 6_000);
  assertEquals(openAIRetryDelayMs(429, null, INCIDENT, 0, NOW), 6_000);
});

Deno.test('reads seconds, milliseconds, and minutes from the body', () => {
  assertEquals(retryHintMs(null, 'Please try again in 6.042s.', NOW), 6_042);
  assertEquals(retryHintMs(null, 'Please try again in 240ms.', NOW), 240);
  assertEquals(retryHintMs(null, 'Please try again in 1.5 seconds.', NOW), 1_500);
  assertEquals(retryHintMs(null, 'Please try again in 2 minutes.', NOW), 120_000);
});

Deno.test('reads Retry-After as delta-seconds or an HTTP date', () => {
  assertEquals(retryHintMs('6', '', NOW), 6_000);
  assertEquals(retryHintMs('6s', '', NOW), 6_000);
  assertEquals(retryHintMs('6.5', '', NOW), 6_500);
  assertEquals(retryHintMs(new Date(NOW + 6_000).toUTCString(), '', NOW), 6_000);
  assertEquals(retryHintMs(new Date(NOW - 5_000).toUTCString(), '', NOW), 0);
});

Deno.test('uses the longer hint when the header and the body disagree', () => {
  assertEquals(retryHintMs('2', 'Please try again in 6s.', NOW), 6_000);
  assertEquals(retryHintMs('8', 'Please try again in 6s.', NOW), 8_000);
  assertEquals(retryHintMs('soon', 'Please try again in 6s.', NOW), 6_000);
});

Deno.test('backs off when a 429 or 5xx carries no hint, and stops when the status will not change', () => {
  assertEquals(openAIRetryDelayMs(429, null, '', 0, NOW), 1_000);
  assertEquals(openAIRetryDelayMs(500, null, '', 1, NOW), 2_000);
  assertEquals(openAIRetryDelayMs(502, null, '', 2, NOW), 4_000);
  assertEquals(openAIRetryDelayMs(503, null, '', OPENAI_MAX_ATTEMPTS - 1, NOW), null);
  assertEquals(openAIRetryDelayMs(504, null, '', 0, NOW), 1_000);
  assertEquals(openAIFailureKind(599, ''), 'retry');
});

Deno.test('caps one sleep, and does not retry a bad request, a rejected key, or an empty quota', () => {
  assertEquals(
    openAIRetryDelayMs(429, null, 'Please try again in 120s.', 0, NOW),
    OPENAI_MAX_DELAY_MS
  );
  assertEquals(openAIRetryDelayMs(400, '6', 'bad schema', 0, NOW), null);
  assertEquals(openAIRetryDelayMs(401, '6', 'invalid api key', 0, NOW), null);
  assertEquals(openAIRetryDelayMs(403, null, 'forbidden', 0, NOW), null);
  assertEquals(
    openAIRetryDelayMs(429, '6', '{"error":{"code":"insufficient_quota"}}', 0, NOW),
    null
  );
  assertEquals(openAIFailureKind(429, INCIDENT), 'retry');
  assertEquals(openAIFailureKind(401, ''), 'config');
  assertEquals(openAIFailureKind(429, 'insufficient_quota'), 'config');
  assertEquals(openAIFailureKind(400, ''), 'stop');
});

Deno.test('concurrency stays at one when OPENAI_CONCURRENCY cannot be read', () => {
  // CI runs `deno test` without --allow-env. Reading the variable must not throw.
  assertEquals(openAIConcurrencyLimit(), 1);
});

Deno.test('a past Retry-After means retry immediately, which is not the same as a missing hint', () => {
  const past = new Date(NOW - 5_000).toUTCString();
  assertEquals(openAIRetryDelayMs(429, past, '', 0, NOW), 0);
});

/* --------------------------------------------------------------- calls */

Deno.test('chat completions wait out 429 and 5xx, and fail closed on the key', async (t) => {
  try {
    await t.step('a 200 does not wait', async () => {
      const sleeps: number[] = [];
      let model = '';
      setOpenAIClientForTests({
        fetch: async (input, init) => {
          assertEquals(String(input), 'https://api.openai.com/v1/chat/completions');
          assertEquals(init?.method, 'POST');
          model = JSON.parse(String(init?.body)).model;
          return chatOk();
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      const fields = await extractFields('Datejust', '1975 Rolex', 'https://shop.example/datejust');
      assertEquals(fields?.brand, 'Rolex');
      assertEquals(model, 'gpt-4o-mini');
      assertEquals(sleeps, []);
    });

    await t.step('a 429 with "try again in 6s" is retried, then the watch is read', async () => {
      const sleeps: number[] = [];
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          if (calls === 1) return errorResponse(429, INCIDENT);
          return chatOk('Omega');
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      const fields = await extractFields('Speedmaster', '1965', 'https://oldschoolseconds.com/p/1');
      assertEquals(fields?.brand, 'Omega');
      assertEquals(calls, 2);
      assertEquals(sleeps, [6_000]);
    });

    await t.step('a 503 honors Retry-After instead of the fallback', async () => {
      const sleeps: number[] = [];
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          if (calls === 1) return errorResponse(503, 'unavailable', { 'retry-after': '2' });
          return chatOk();
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      const fields = await extractFields('Submariner', 'steel', 'https://shop.example/sub');
      assertEquals(fields?.brand, 'Rolex');
      assertEquals(calls, 2);
      assertEquals(sleeps, [2_000]);
    });

    await t.step('a 429 that never clears fails the watch, and is not a bad key', async () => {
      const sleeps: number[] = [];
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          return errorResponse(429, INCIDENT);
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      const error = await assertRejects(
        () => extractFields('Datejust', '1975', 'https://shop.example/dj'),
        ExtractorUnavailable,
        '429'
      );
      assertEquals(error instanceof ExtractorUnavailable && error.config, false);
      assertEquals(error.message.includes('rate_limit_exceeded'), true);
      assertEquals(calls, OPENAI_MAX_ATTEMPTS);
      assertEquals(sleeps, [6_000, 6_000, 6_000]);
    });

    await t.step('one call stops waiting once its own budget is spent', async () => {
      const sleeps: number[] = [];
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          return errorResponse(429, 'Please try again in 20s.');
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      });

      const error = await assertRejects(
        () => extractFields('Datejust', '1975', 'https://shop.example/dj'),
        ExtractorUnavailable
      );
      assertEquals(error instanceof ExtractorUnavailable && error.config, false);
      assertEquals(calls, 2);
      assertEquals(sleeps, [OPENAI_MAX_DELAY_MS]);
    });

    await t.step('401 and an empty quota are config errors, and they are not retried', async () => {
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          return errorResponse(401, '{"error":{"message":"Incorrect API key"}}');
        },
        sleep: async () => {
          throw new Error('slept');
        },
      });

      const rejected = await assertRejects(
        () => extractFields('Datejust', '1975', 'https://shop.example/dj'),
        ExtractorUnavailable,
        '401'
      );
      assertEquals(rejected instanceof ExtractorUnavailable && rejected.config, true);
      assertEquals(calls, 1);

      calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          return errorResponse(429, '{"error":{"code":"insufficient_quota","message":"billing"}}');
        },
        sleep: async () => {
          throw new Error('slept');
        },
      });
      const quota = await assertRejects(
        () => extractFields('Datejust', '1975', 'https://shop.example/dj'),
        ExtractorUnavailable,
        'insufficient_quota'
      );
      assertEquals(quota instanceof ExtractorUnavailable && quota.config, true);
      assertEquals(calls, 1);
    });

    await t.step('a 400 fails that call without a retry', async () => {
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          return errorResponse(400, 'bad schema');
        },
        sleep: async () => {
          throw new Error('slept');
        },
      });

      const error = await assertRejects(
        () => extractFields('Datejust', '1975', 'https://shop.example/dj'),
        ExtractorUnavailable,
        '400'
      );
      assertEquals(error instanceof ExtractorUnavailable && error.config, false);
      assertEquals(calls, 1);
    });

    await t.step('a missing key never calls OpenAI', async () => {
      let calls = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          calls += 1;
          return chatOk();
        },
        apiKey: () => undefined,
      });

      const error = await assertRejects(
        () => extractFields('Datejust', '1975', 'https://shop.example/dj'),
        ExtractorUnavailable,
        'OPENAI_API_KEY'
      );
      assertEquals(error instanceof ExtractorUnavailable && error.config, true);
      assertEquals(calls, 0);
    });

    await t.step('one completion is in flight at a time', async () => {
      const gate = deferred();
      let fetches = 0;
      let inFlight = 0;
      let maxInFlight = 0;
      setOpenAIClientForTests({
        fetch: async () => {
          fetches += 1;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          if (fetches === 1) await gate.promise;
          inFlight -= 1;
          return chatOk();
        },
      });

      const pending = Promise.all([
        extractFields('Rolex', 'one', 'https://shop.example/1'),
        extractFields('Omega', 'two', 'https://shop.example/2'),
      ]);
      try {
        await flush();
        assertEquals(fetches, 1);
        assertEquals(maxInFlight, 1);
        gate.resolve();
        await pending;
        assertEquals(fetches, 2);
        assertEquals(maxInFlight, 1);
      } finally {
        gate.resolve();
        await pending.catch(() => undefined);
      }
    });

    await t.step('the backoff holds the gate, so the next watch does not race the 429', async () => {
      const slept = deferred();
      let fetches = 0;
      const sleeps: number[] = [];
      setOpenAIClientForTests({
        fetch: async () => {
          fetches += 1;
          if (fetches === 1) return errorResponse(429, INCIDENT);
          return chatOk(fetches === 2 ? 'Rolex' : 'Omega');
        },
        sleep: async (ms) => {
          sleeps.push(ms);
          await slept.promise;
        },
      });

      const pending = Promise.all([
        extractFields('Rolex', 'one', 'https://shop.example/1'),
        extractFields('Omega', 'two', 'https://shop.example/2'),
      ]);
      try {
        for (let i = 0; i < 50 && sleeps.length < 1; i += 1) await Promise.resolve();
        await flush();
        assertEquals(fetches, 1);
        assertEquals(sleeps, [6_000]);
        slept.resolve();
        const fields = await pending;
        assertEquals(fetches, 3);
        assertEquals(fields[0]?.brand, 'Rolex');
        assertEquals(fields[1]?.brand, 'Omega');
      } finally {
        slept.resolve();
        await pending.catch(() => undefined);
      }
    });
  } finally {
    setOpenAIClientForTests(null);
  }
});
