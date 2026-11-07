/**
 * Local-only fixture import. Publishing a JSON watch skips the scrape and the
 * model call. The hosted project never has the flag, and a URL that names the
 * production ref is refused even if the flag is copied there by mistake.
 */

const PRODUCTION_REF = 'hbxgxtbtefpyutyqafoi';

export function fixtureImportAllowed(env: { get(name: string): string | undefined }): boolean {
  if (env.get('GRAHAM_ALLOW_FIXTURE_IMPORT') !== '1') return false;
  const url = env.get('SUPABASE_URL') ?? '';
  if (!url || url.includes(PRODUCTION_REF)) return false;
  try {
    const host = new URL(url).hostname;
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === 'kong' ||
      host === 'host.docker.internal'
    );
  } catch {
    return false;
  }
}

export type FixtureListing = {
  brand: string;
  model: string | null;
  reference: string | null;
  year: number | null;
  price_cents: number | null;
  description: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFixtureListings(body: Record<string, unknown>): {
  dealerId: string;
  listings: FixtureListing[];
} {
  const dealerId = typeof body.dealerId === 'string' ? body.dealerId.trim() : '';
  if (!UUID.test(dealerId)) throw new Error('fixture needs a dealerId.');

  const raw = body.listings;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) {
    throw new Error('fixture needs 1 to 5 listings.');
  }

  const listings: FixtureListing[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') throw new Error('A fixture listing must be an object.');
    const row = item as Record<string, unknown>;
    const brand = typeof row.brand === 'string' ? row.brand.trim() : '';
    if (!brand) throw new Error('A fixture listing needs a brand.');
    listings.push({
      brand,
      model: typeof row.model === 'string' ? row.model : null,
      reference: typeof row.reference === 'string' ? row.reference : null,
      year: typeof row.year === 'number' ? row.year : null,
      price_cents: typeof row.price_cents === 'number' ? row.price_cents : null,
      description: typeof row.description === 'string' ? row.description : null,
    });
  }
  return { dealerId, listings };
}
