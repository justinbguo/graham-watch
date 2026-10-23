/**
 * The fields an operator may correct on a watch, in the shape the form holds
 * and the shape `operator_edit_listing` expects.
 *
 * Price is dollars on screen and cents in the column, the same split the
 * dealer's editor uses. Empty optional fields become null: "we do not know"
 * is a real value, and an empty string would be a brand new fact.
 */

export type ListingDraft = {
  brand: string;
  model: string;
  reference: string;
  year: string;
  size: string;
  price: string;
  condition: string;
  description: string;
};

export type ListingSource = {
  brand: string | null;
  model: string | null;
  reference: string | null;
  year: number | null;
  case_size_mm: number | null;
  price_cents: number | null;
  condition: string | null;
  description: string | null;
};

export type ListingEdits = {
  p_brand: string;
  p_model: string | null;
  p_reference: string | null;
  p_year: number | null;
  p_case_size_mm: number | null;
  p_price_cents: number | null;
  p_condition: string | null;
  p_description: string | null;
};

export function centsToDollars(cents: number | null): string {
  if (cents == null) return '';
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export function draftFrom(listing: ListingSource): ListingDraft {
  return {
    brand: listing.brand ?? '',
    model: listing.model ?? '',
    reference: listing.reference ?? '',
    year: listing.year == null ? '' : String(listing.year),
    size: listing.case_size_mm == null ? '' : String(listing.case_size_mm),
    price: centsToDollars(listing.price_cents),
    condition: listing.condition ?? '',
    description: listing.description ?? '',
  };
}

export function editsFrom(draft: ListingDraft): ListingEdits | { error: string } {
  const brand = draft.brand.trim();
  if (!brand) return { error: 'A watch needs a brand.' };

  const year = parseWhole(draft.year, 'Year');
  if (typeof year === 'string') return { error: year };
  if (year != null && (year < 1800 || year > new Date().getFullYear() + 1)) {
    return { error: 'That year is not a watch.' };
  }

  const size = parseDecimal(draft.size, 'Case size');
  if (typeof size === 'string') return { error: size };
  if (size != null && (size <= 0 || size > 80)) {
    return { error: 'Case size is in millimetres.' };
  }

  const price = dollarsToCents(draft.price);
  if (typeof price === 'string') return { error: price };

  const description = emptyToNull(draft.description);
  if (description && description.length > 8000) return { error: 'Description is too long.' };

  return {
    p_brand: brand,
    p_model: emptyToNull(draft.model),
    p_reference: emptyToNull(draft.reference),
    p_year: year,
    p_case_size_mm: size,
    p_price_cents: price,
    p_condition: emptyToNull(draft.condition),
    p_description: description,
  };
}

export function dollarsToCents(value: string): number | null | string {
  const trimmed = value.trim().replace(/[$,]/g, '');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return 'Price cannot be negative.';
  return Math.round(parsed * 100);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseWhole(value: string, label: string): number | null | string {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return `${label} should be a whole number.`;
  return Number.parseInt(trimmed, 10);
}

function parseDecimal(value: string, label: string): number | null | string {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return `${label} should be a number.`;
  return parsed;
}

export function isEdits(value: ListingEdits | { error: string }): value is ListingEdits {
  return !('error' in value);
}
