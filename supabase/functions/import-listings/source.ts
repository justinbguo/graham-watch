/**
 * One watch as the dealer's own site describes it, before any model has guessed
 * at it. Every platform adapter reduces to this, so the importer never needs to
 * know which shop software it is talking to.
 */
export type SourceItem = {
  title: string;
  text: string;
  sourceUrl: string;
  photoUrls: string[];
  priceCents: number | null;
  currency: string | null;
};

export const USER_AGENT = 'GrahamBot/0.1 (+https://graham.app)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export async function fetchJson(url: URL): Promise<Json | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
