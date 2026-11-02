import type { DeckCard } from '@/lib/models';

// Same constraint as facets.ts: the app tests load this file in Node.
import { toRpcArgs, type Filters } from './types.ts';

/** A value matches when it sits in any chosen band. No bands means no filter. */
function inSomeBand(
  value: number | null,
  mins: (number | null)[] | undefined,
  maxs: (number | null)[] | undefined,
): boolean {
  if (!mins || !maxs) return true;
  if (value == null) return false;
  return mins.some((lo, index) => {
    const hi = maxs[index];
    if (lo != null && value < lo) return false;
    if (hi != null && value > hi) return false;
    return true;
  });
}

/**
 * The same cuts `search_listings` applies in the database. The shop page
 * already holds every watch that shop has for sale, so it filters that list
 * instead of asking again.
 */
export function matchesListing(card: DeckCard, filters: Filters): boolean {
  const f = toRpcArgs(filters);
  const text = `${card.brand} ${card.model ?? ''} ${card.reference ?? ''}`.toLowerCase();

  if (f.p_query && !text.includes(f.p_query.toLowerCase())) return false;
  if (f.p_brands && !f.p_brands.includes(card.brand_key ?? '')) return false;
  if (f.p_dealers && !f.p_dealers.includes(card.dealer_id)) return false;
  if (f.p_styles && (!card.style || !f.p_styles.includes(card.style))) return false;
  if (f.p_materials && (!card.case_material || !f.p_materials.includes(card.case_material))) return false;
  if (f.p_windings && (!card.winding || !f.p_windings.includes(card.winding))) return false;
  if (f.p_complications && !f.p_complications.every((c) => card.complications.includes(c))) return false;
  if (!inSomeBand(card.price_cents, f.p_price_mins, f.p_price_maxs)) return false;
  if (!inSomeBand(card.case_size_mm, f.p_size_mins, f.p_size_maxs)) return false;
  if (!inSomeBand(card.year, f.p_year_mins, f.p_year_maxs)) return false;

  return true;
}
