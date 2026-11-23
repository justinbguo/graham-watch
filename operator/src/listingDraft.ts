import { parseListingNumbers } from '../../shared/listingParse.ts';

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

export type OperatorListingEdits = {
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

export function editsFrom(draft: ListingDraft): OperatorListingEdits | { error: string } {
  const parsed = parseListingNumbers({
    brand: draft.brand,
    year: draft.year,
    caseSize: draft.size,
    price: draft.price,
    description: draft.description,
  });
  if ('error' in parsed) return parsed;
  return {
    p_brand: parsed.brand,
    p_model: emptyToNull(draft.model),
    p_reference: emptyToNull(draft.reference),
    p_year: parsed.year,
    p_case_size_mm: parsed.caseSize,
    p_price_cents: parsed.priceCents,
    p_condition: emptyToNull(draft.condition),
    p_description: parsed.description,
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isEdits(
  value: OperatorListingEdits | { error: string },
): value is OperatorListingEdits {
  return !('error' in value);
}
