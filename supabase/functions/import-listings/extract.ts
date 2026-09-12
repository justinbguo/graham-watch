export type ExtractedFields = {
  brand: string;
  model: string | null;
  reference: string | null;
  year: number | null;
  movement: string | null;
  case_size_mm: number | null;
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

const FIELDS = {
  brand: { type: 'string' },
  model: nullable('string'),
  reference: nullable('string'),
  year: nullable('integer'),
  movement: nullable('string'),
  case_size_mm: nullable('number'),
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
first year of that decade. Circa dates are specific years: "c. 1948" is 1948.`;

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
