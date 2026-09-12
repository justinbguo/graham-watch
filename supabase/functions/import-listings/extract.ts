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

async function complete(
  system: string,
  user: string,
  schema: unknown,
  schemaName: string
): Promise<unknown> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content.');
  return JSON.parse(content);
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
