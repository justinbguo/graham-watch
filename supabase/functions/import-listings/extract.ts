import { TIMEOUT } from '../_shared/timeouts.ts';
import {
  CASE_MATERIALS,
  COMPLICATIONS,
  DIAL_COLORS,
  STYLES,
  WINDINGS,
} from './taxonomy.ts';

export type ExtractedFields = {
  brand: string;
  model: string | null;
  reference: string | null;
  year: number | null;
  caliber: string | null;
  winding: (typeof WINDINGS)[number] | null;
  case_size_mm: number | null;
  case_material: (typeof CASE_MATERIALS)[number] | null;
  dial_color: (typeof DIAL_COLORS)[number] | null;
  style: (typeof STYLES)[number] | null;
  complications: (typeof COMPLICATIONS)[number][];
  condition: string | null;
  has_box: boolean | null;
  has_papers: boolean | null;
  price_cents: number | null;
  currency: string | null;
  description: string | null;
};

export type ExtractedListing = ExtractedFields & {
  photo_urls: string[];
  source_url: string | null;
};

const nullable = (type: string) => ({ type: [type, 'null'] });

// Listing null in the enum is what makes "not stated" expressible. Without it
// the model must pick a wrong value rather than admit the page is silent.
const nullableEnum = (values: readonly string[]) => ({
  type: ['string', 'null'],
  enum: [...values, null],
});

const FIELDS = {
  brand: { type: 'string' },
  model: nullable('string'),
  reference: nullable('string'),
  year: nullable('integer'),
  caliber: { ...nullable('string'), description: 'Movement caliber, e.g. "Venus 150"' },
  winding: nullableEnum(WINDINGS),
  case_size_mm: nullable('number'),
  case_material: nullableEnum(CASE_MATERIALS),
  dial_color: nullableEnum(DIAL_COLORS),
  style: nullableEnum(STYLES),
  complications: {
    type: 'array',
    items: { type: 'string', enum: COMPLICATIONS },
    description: 'Every complication the watch has. Empty when it is time-only.',
  },
  condition: nullable('string'),
  has_box: nullable('boolean'),
  has_papers: nullable('boolean'),
  price_cents: { ...nullable('integer'), description: 'Price in minor units' },
  currency: { ...nullable('string'), description: 'ISO 4217 code, e.g. USD' },
  description: nullable('string'),
} as const;

// strict mode requires every property to be listed as required; nullable types
// are how a field is made optional in practice.
const objectSchema = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const PAGE_SCHEMA = objectSchema({
  listings: {
    type: 'array',
    items: objectSchema({
      ...FIELDS,
      photo_urls: { type: 'array', items: { type: 'string' } },
      source_url: nullable('string'),
    }),
  },
});

const ITEM_SCHEMA = objectSchema(FIELDS);

const SHARED_RULES = `Never invent a value: if the text does not state something, return
null. Prices are in minor units (cents). Read titles closely, they usually carry brand,
model and reference.

For year: if a specific year is stated, return exactly that year — "1975 Rolex Datejust"
is 1975, not 1970. Only when a decade alone is given ("1960's", "mid sixties") return the
first year of that decade. Circa dates are specific years: "c. 1948" is 1948.

caliber is the movement's name ("Venus 150", "Cal. 3135"); winding is how it is wound.
A watch described only as "manual" has a winding and no caliber. two_tone is for cases
combining steel and gold. style is the single best fit; complications lists everything
the watch actually does, and is empty for a time-only watch. A date window is the 'date'
complication. An everyday steel watch on a bracelet, like a Datejust or an Explorer, is
'sports'. Choose 'other' only when the page describes something the list cannot express —
prefer null when the page simply does not say.`;

const PAGE_PROMPT = `You extract vintage watch listings from scraped web pages.
Return one entry per watch actually for sale on the page. Ignore navigation, blog
posts, and sold items. ${SHARED_RULES} Resolve photo URLs to absolute URLs.`;

const ITEM_PROMPT = `You parse a single vintage watch listing into typed fields. The
title and description come from the dealer's own product page, so everything you need
is in them. ${SHARED_RULES} Write description as one or two plain sentences drawn from
the dealer's prose, without marketing superlatives.`;

/**
 * One chat completion at a time.
 *
 * The publish pool runs several watches at once, and that burst is what a
 * 10-request-per-minute key answers with 429. The gate lives on the model
 * call, so photograph copies still overlap. The gap is not a fixed six
 * seconds: a higher quota just proceeds, and a 429 waits for the hint
 * OpenAI sent.
 *
 * Override with OPENAI_CONCURRENCY (1–4) when the key allows more than one
 * in flight. Unset means one. `deno test` does not grant env access, and
 * Deno throws NotCapable instead of returning undefined — that is the same
 * as unset, not a failed extraction.
 */
export function openAIConcurrencyLimit(): number {
  let raw: string | undefined;
  try {
    raw = Deno.env.get('OPENAI_CONCURRENCY');
  } catch (error) {
    if (!(error instanceof Deno.errors.NotCapable)) throw error;
    raw = undefined;
  }
  const parsed = raw ? Number(raw) : 1;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(Math.floor(parsed), 4);
}

/** First try plus three waits. A 429 that survives this fails the shop. */
export const OPENAI_MAX_ATTEMPTS = 4;

/**
 * Ceiling for one sleep. The hint this tier sends is a few seconds ("try
 * again in 6s"); a longer one must not own the invocation.
 */
export const OPENAI_MAX_DELAY_MS = 15_000;

/**
 * Ceiling for every sleep inside one completion.
 *
 * The nightly refresh is one HTTP request, and the platform closes it after
 * 150s (edge function request idle timeout). Three six-second hints fit;
 * a watch that is still limited after that fails so the other shops get
 * their turn.
 */
export const OPENAI_MAX_CALL_WAIT_MS = 20_000;

const HINT =
  /try again in\s+(\d+(?:\.\d+)?)\s*(milliseconds|millisecond|seconds|second|minutes|minute|ms|secs|sec|min|m|s)\b/i;

/**
 * The extractor failed, rather than the watch being unreadable.
 *
 * A missing key, a rejected key, or a rate limit that outlasted the waits
 * above fails every watch the same way. Recording that against the row would
 * bury the catalogue behind an error that has nothing to do with any of it,
 * so the caller fails the batch and leaves the row clean for the next night.
 * `config` means the key itself is missing or rejected: another shop will
 * fail identically, and the nightly job stops instead of walking the list.
 */
export class ExtractorUnavailable extends Error {
  readonly config: boolean;

  constructor(message: string, options?: { config?: boolean }) {
    super(message);
    this.name = 'ExtractorUnavailable';
    this.config = options?.config ?? false;
  }
}

/** How this status should be treated. `retry` is 429 and 5xx, apart from a dead quota. */
export function openAIFailureKind(status: number, body: string): 'retry' | 'config' | 'stop' {
  if (status === 401 || status === 403) return 'config';
  // Billing, not the per-minute window. Waiting cannot refill it.
  if (status === 429 && /insufficient_quota/.test(body)) return 'config';
  if (status === 429 || (status >= 500 && status <= 599)) return 'retry';
  return 'stop';
}

function unitMs(unit: string): number {
  const name = unit.toLowerCase();
  if (name === 'ms' || name.startsWith('milli')) return 1;
  if (name === 'm' || name.startsWith('min')) return 60_000;
  return 1_000;
}

/** Retry-After is either delta-seconds or an HTTP date. */
function retryAfterHeaderMs(value: string, now: number): number | null {
  const trimmed = value.trim();
  const seconds = /^(\d+(?:\.\d+)?)\s*s?$/i.exec(trimmed);
  if (seconds) return Math.round(Number(seconds[1]) * 1_000);

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

function bodyHintMs(body: string): number | null {
  const match = HINT.exec(body);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * unitMs(match[2]));
}

/**
 * How long OpenAI asked us to wait, in milliseconds.
 *
 * The header and the "try again in 6s" line in the body should agree. When
 * they don't, the longer one is what keeps the next attempt out of the window
 * that just rejected us. `null` means the response carried no hint.
 */
export function retryHintMs(
  retryAfter: string | null,
  body: string,
  now = Date.now()
): number | null {
  const hints = [
    retryAfter ? retryAfterHeaderMs(retryAfter, now) : null,
    bodyHintMs(body),
  ].filter((value): value is number => value !== null);
  if (!hints.length) return null;
  return Math.max(...hints);
}

/**
 * Delay before another attempt, or `null` when this failure is final.
 *
 * A missing hint falls back to 1s, 2s, 4s. The delay is capped so one
 * answer cannot sleep for the rest of the refresh.
 */
export function openAIRetryDelayMs(
  status: number,
  retryAfter: string | null,
  body: string,
  attempt: number,
  now = Date.now()
): number | null {
  if (openAIFailureKind(status, body) !== 'retry') return null;
  if (attempt >= OPENAI_MAX_ATTEMPTS - 1) return null;
  const hinted = retryHintMs(retryAfter, body, now);
  const backoff = 1_000 * 2 ** attempt;
  return Math.min(hinted ?? backoff, OPENAI_MAX_DELAY_MS);
}

type OpenAIClient = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  apiKey: () => string | undefined;
  model: () => string;
  /**
   * Tests pass a signal with no timer. AbortSignal.timeout keeps a 60s timer
   * that would outlive the test and hold the process open.
   */
  abortSignal: () => AbortSignal;
};

function productionClient(): OpenAIClient {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    apiKey: () => Deno.env.get('OPENAI_API_KEY'),
    model: () => Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
    abortSignal: () => AbortSignal.timeout(TIMEOUT.model),
  };
}

let client = productionClient();
let active = 0;
const waiting: Array<() => void> = [];

/** Tests install a fake network and clock. Passing null restores production. */
export function setOpenAIClientForTests(next: Partial<OpenAIClient> | null) {
  if (!next) {
    client = productionClient();
  } else {
    if (!next.fetch) throw new Error('A test OpenAI client needs fetch.');
    client = {
      fetch: next.fetch,
      sleep: next.sleep ?? (() => Promise.resolve()),
      now: next.now ?? (() => 0),
      apiKey: next.apiKey ?? (() => 'test-key'),
      model: next.model ?? (() => 'gpt-4o-mini'),
      abortSignal: next.abortSignal ?? (() => new AbortController().signal),
    };
  }
  active = 0;
  waiting.length = 0;
}

function acquire(): Promise<void> {
  if (active < openAIConcurrencyLimit()) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release() {
  active -= 1;
  const resume = waiting.shift();
  if (resume) resume();
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= 500) return flat;
  return `${flat.slice(0, 500)}…`;
}

async function chat(
  apiKey: string,
  system: string,
  user: string,
  schema: unknown,
  schemaName: string
): Promise<unknown> {
  let lastMessage = 'OpenAI returned no content.';

  let waited = 0;
  for (let attempt = 0; attempt < OPENAI_MAX_ATTEMPTS; attempt += 1) {
    const response = await client.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: client.model(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, strict: true, schema },
        },
      }),
      signal: client.abortSignal(),
    });

    if (response.ok) {
      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      if (!content) throw new ExtractorUnavailable('OpenAI returned no content.');
      return JSON.parse(content);
    }

    const text = await response.text();
    const detail = clip(text);
    lastMessage = detail
      ? `OpenAI returned ${response.status}: ${detail}`
      : `OpenAI returned ${response.status}`;

    const kind = openAIFailureKind(response.status, text);
    if (kind === 'config') throw new ExtractorUnavailable(lastMessage, { config: true });

    const delay = openAIRetryDelayMs(
      response.status,
      response.headers.get('retry-after'),
      text,
      attempt,
      client.now()
    );
    if (kind !== 'retry' || delay === null) throw new ExtractorUnavailable(lastMessage);

    if (waited + delay > OPENAI_MAX_CALL_WAIT_MS) {
      console.warn(
        `OpenAI returned ${response.status}; not waiting ${delay}ms because this call has already waited ${waited}ms.`
      );
      throw new ExtractorUnavailable(lastMessage);
    }

    waited += delay;
    console.warn(
      `OpenAI returned ${response.status}; waiting ${delay}ms (attempt ${attempt + 1} of ${OPENAI_MAX_ATTEMPTS}).`
    );
    if (delay > 0) await client.sleep(delay);
  }

  throw new ExtractorUnavailable(lastMessage);
}

async function complete(
  system: string,
  user: string,
  schema: unknown,
  schemaName: string
): Promise<unknown> {
  const apiKey = client.apiKey();
  if (!apiKey) throw new ExtractorUnavailable('OPENAI_API_KEY is not set.', { config: true });

  // Held across the backoff as well as the request, so a burst of watches
  // queues here instead of collecting a 429 each.
  await acquire();
  try {
    return await chat(apiKey, system, user, schema, schemaName);
  } finally {
    release();
  }
}

/** For pages where we do not know what the listings are. The model finds them. */
export async function extractListings(
  markdown: string,
  sourceUrl: string
): Promise<ExtractedListing[]> {
  const parsed = (await complete(
    PAGE_PROMPT,
    `Source URL: ${sourceUrl}\n\n${markdown}`,
    PAGE_SCHEMA,
    'watch_listings'
  )) as { listings?: ExtractedListing[] };

  return (parsed.listings ?? []).filter((listing) => Boolean(listing.brand));
}

/**
 * For a listing we already know is one watch. Far more accurate than asking the
 * model to find watches in a page, and the prompt is short enough to be cheap.
 */
export async function extractFields(
  title: string,
  text: string,
  sourceUrl: string
): Promise<ExtractedFields | null> {
  const fields = (await complete(
    ITEM_PROMPT,
    `Source URL: ${sourceUrl}\nTitle: ${title}\n\n${text}`,
    ITEM_SCHEMA,
    'watch_listing'
  )) as ExtractedFields;

  return fields?.brand ? fields : null;
}
