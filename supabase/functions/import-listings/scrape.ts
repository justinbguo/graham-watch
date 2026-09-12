// Scrape providers all reduce to the same thing: a URL in, clean text out.
// Swap with the SCRAPE_PROVIDER env var. See docs/SCRAPING.md for tradeoffs.
export type ScrapeProvider = 'firecrawl' | 'jina' | 'fetch';

export type ScrapeResult = {
  markdown: string;
  provider: ScrapeProvider;
};

const MAX_CHARS = 120_000;

async function firecrawl(url: string): Promise<string> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set.');

  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
  });

  if (!response.ok) {
    throw new Error(`Firecrawl returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const markdown = body?.data?.markdown;
  if (!markdown) throw new Error('Firecrawl returned no markdown.');
  return markdown;
}

async function jina(url: string): Promise<string> {
  // r.jina.ai works without a key, but a key raises the rate limit.
  const apiKey = Deno.env.get('JINA_API_KEY');
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Jina Reader returned ${response.status}.`);
  }
  return response.text();
}

async function plainFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GrahamBot/0.1 (+https://graham.app)' },
  });
  if (!response.ok) throw new Error(`Source returned ${response.status}.`);

  const html = await response.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scrape(url: string): Promise<ScrapeResult> {
  const provider = (Deno.env.get('SCRAPE_PROVIDER') ?? 'fetch') as ScrapeProvider;

  const run = { firecrawl, jina, fetch: plainFetch }[provider];
  if (!run) throw new Error(`Unknown SCRAPE_PROVIDER "${provider}".`);

  const markdown = await run(url);
  return { markdown: markdown.slice(0, MAX_CHARS), provider };
}
