// Scrape providers all reduce to the same thing: a URL in, clean text out.
// See docs/SCRAPING.md for tradeoffs.
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
  const apiKey = Deno.env.get('JINA_API_KEY');
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });

  // r.jina.ai used to work anonymously and no longer does.
  if (response.status === 401) {
    throw new Error('Jina Reader needs JINA_API_KEY. Get a free key at jina.ai/reader.');
  }
  if (!response.ok) {
    throw new Error(`Jina Reader returned ${response.status}.`);
  }
  return response.text();
}

function absolute(href: string, base: URL): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

/**
 * Stripping every tag is the obvious way to turn a page into text and the wrong
 * one: `<img src>` holds the listing photos, and they are gone before the model
 * ever sees them. Pull images and links out first, as absolute URLs.
 */
export function htmlToText(html: string, pageUrl: string): string {
  const base = new URL(pageUrl);

  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  out = out.replace(/<img\b[^>]*>/gi, (tag) => {
    // Lazy-loaded galleries keep the real file in data-src or srcset.
    const src =
      tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i)?.[1] ??
      tag.match(/\bsrcset\s*=\s*["']([^"'\s,]+)/i)?.[1];
    const url = src ? absolute(src, base) : null;
    return url ? ` ![](${url}) ` : ' ';
  });

  out = out.replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi, (_match, href: string) => {
    const url = absolute(href, base);
    return url ? ` [${url}] ` : ' ';
  });

  out = out
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(char);
  }

  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*(\n[ \t]*)+/g, '\n')
    .trim();
}

async function plainFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'GrahamBot/0.1 (+https://graham.app)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`Source returned ${response.status}.`);
  return htmlToText(await response.text(), url);
}

/**
 * Works with nothing configured, and gets better as keys are added. Firecrawl
 * renders JavaScript, Jina cleans the page, plain fetch handles static HTML.
 */
export function resolveProvider(): ScrapeProvider {
  const explicit = Deno.env.get('SCRAPE_PROVIDER') as ScrapeProvider | undefined;
  if (explicit) return explicit;
  if (Deno.env.get('FIRECRAWL_API_KEY')) return 'firecrawl';
  if (Deno.env.get('JINA_API_KEY')) return 'jina';
  return 'fetch';
}

export async function scrape(url: string): Promise<ScrapeResult> {
  const provider = resolveProvider();

  const run = { firecrawl, jina, fetch: plainFetch }[provider];
  if (!run) throw new Error(`Unknown SCRAPE_PROVIDER "${provider}".`);

  const markdown = await run(url);
  if (markdown.trim().length < 200) {
    throw new Error(
      `${provider} returned almost nothing. The page probably renders with JavaScript — set FIRECRAWL_API_KEY or JINA_API_KEY.`
    );
  }

  return { markdown: markdown.slice(0, MAX_CHARS), provider };
}
