/**
 * Local-only fixture import. Publishing a JSON watch skips the scrape and the
 * model call. The hosted project never has the flag, and a URL that names the
 * production ref is refused even if the flag is copied there by mistake.
 */

import { mapWooProduct } from './woocommerce.ts';

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

/**
 * A publishable Store API row, turned into the local fixture insert.
 * Brand is the first two words of the title because this path skips the model
 * that normally reads the brand. The hosted function never reaches it.
 */
export function listingsFromWooProducts(
  products: unknown[],
  origin: string,
): {
  listings: Array<FixtureListing & { photoUrls: string[]; sourceUrl: string }>;
  skipped: Array<{ title: string; reason: string }>;
} {
  if (products.length < 1 || products.length > 20) {
    throw new Error('A WooCommerce fixture needs 1 to 20 products.');
  }
  const listings: Array<FixtureListing & { photoUrls: string[]; sourceUrl: string }> = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  for (const raw of products) {
    const mapped = mapWooProduct(raw, origin, 3);
    if ('reason' in mapped) {
      skipped.push({ title: mapped.title, reason: mapped.reason });
      continue;
    }
    if (!mapped.available || mapped.holdReason || !(mapped.priceCents && mapped.priceCents > 0)) {
      skipped.push({
        title: mapped.title,
        reason: mapped.holdReason ? `held: ${mapped.holdReason}` : 'not for sale',
      });
      continue;
    }
    const words = mapped.title.split(/\s+/).filter(Boolean);
    const brand = words.slice(0, 2).join(' ');
    const model = words.slice(2).join(' ') || null;
    listings.push({
      brand,
      model,
      reference: null,
      year: null,
      price_cents: mapped.priceCents,
      description: mapped.text.slice(0, 500) || null,
      photoUrls: mapped.photoUrls.slice(0, 6),
      sourceUrl: mapped.sourceUrl,
    });
  }
  if (listings.length < 1 || listings.length > 5) {
    throw new Error('A WooCommerce fixture needs 1 to 5 publishable watches.');
  }
  return { listings, skipped };
}

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
