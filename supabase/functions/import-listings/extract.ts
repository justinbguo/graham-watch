export type ExtractedListing = {
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
  photo_urls: string[];
  source_url: string | null;
};

const nullable = (type: string) => ({ type: [type, 'null'] });

const LISTING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['listings'],
  properties: {
    listings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'brand',
          'model',
          'reference',
          'year',
          'movement',
          'case_size_mm',
          'condition',
          'has_box',
          'has_papers',
          'price_cents',
          'currency',
          'description',
          'photo_urls',
          'source_url',
        ],
        properties: {
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
          photo_urls: { type: 'array', items: { type: 'string' } },
          source_url: nullable('string'),
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You extract vintage watch listings from scraped web pages.
Return one entry per watch actually for sale on the page. Ignore navigation, blog
posts, and sold items. Never invent a value: if the page does not state something,
return null. Prices are in minor units (cents). Resolve photo URLs to absolute URLs.`;

export async function extractListings(
  markdown: string,
  sourceUrl: string
): Promise<ExtractedListing[]> {
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Source URL: ${sourceUrl}\n\n${markdown}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'watch_listings', strict: true, schema: LISTING_SCHEMA },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content.');

  const parsed = JSON.parse(content) as { listings?: ExtractedListing[] };
  return (parsed.listings ?? []).filter((listing) => Boolean(listing.brand));
}
