export type ListingNumbers = {
  brand: string;
  year: number | null;
  caseSize: number | null;
  priceCents: number | null;
  description: string | null;
};

export function parseListingNumbers(input: {
  brand: string;
  year: string;
  caseSize: string;
  price: string;
  description: string;
}): ListingNumbers | { error: string } {
  const brand = input.brand.trim();
  if (!brand) return { error: 'A watch needs a brand.' };

  const year = parseWhole(input.year, 'Year');
  if (typeof year === 'string') return { error: year };
  if (year != null && (year < 1800 || year > new Date().getFullYear() + 1)) {
    return { error: 'That year is not a watch.' };
  }

  const caseSize = parseDecimal(input.caseSize, 'Case size');
  if (typeof caseSize === 'string') return { error: caseSize };
  if (caseSize != null && (caseSize <= 0 || caseSize > 80)) {
    return { error: 'Case size is in millimetres.' };
  }

  const priceCents = dollarsToCents(input.price);
  if (typeof priceCents === 'string') return { error: priceCents };

  const description = emptyToNull(input.description);
  if (description && description.length > 8000) return { error: 'Description is too long.' };

  return { brand, year, caseSize, priceCents, description };
}

export function dealerListingChanges<Winding, Material, Dial, Style, Complication>(draft: {
  brand: string;
  model: string;
  reference: string;
  year: string;
  caliber: string;
  condition: string;
  price: string;
  currency: string;
  caseSize: string;
  description: string;
  sourceUrl: string;
  winding: Winding | null;
  caseMaterial: Material | null;
  dialColor: Dial | null;
  style: Style | null;
  complications: Complication[];
  hasBox: boolean | null;
  hasPapers: boolean | null;
}):
  | { error: string }
  | {
      brand: string;
      model: string | null;
      reference: string | null;
      year: number | null;
      caliber: string | null;
      condition: string | null;
      price_cents: number | null;
      currency: string;
      case_size_mm: number | null;
      description: string | null;
      source_url: string | null;
      winding: Winding | null;
      case_material: Material | null;
      dial_color: Dial | null;
      style: Style | null;
      complications: Complication[];
      has_box: boolean | null;
      has_papers: boolean | null;
    } {
  const parsed = parseListingNumbers({
    brand: draft.brand,
    year: draft.year,
    caseSize: draft.caseSize,
    price: draft.price,
    description: draft.description,
  });
  if ('error' in parsed) return parsed;
  return {
    brand: parsed.brand,
    model: emptyToNull(draft.model),
    reference: emptyToNull(draft.reference),
    year: parsed.year,
    caliber: emptyToNull(draft.caliber),
    condition: emptyToNull(draft.condition),
    price_cents: parsed.priceCents,
    currency: draft.currency,
    case_size_mm: parsed.caseSize,
    description: parsed.description,
    source_url: emptyToNull(draft.sourceUrl),
    winding: draft.winding,
    case_material: draft.caseMaterial,
    dial_color: draft.dialColor,
    style: draft.style,
    complications: draft.complications,
    has_box: draft.hasBox,
    has_papers: draft.hasPapers,
  };
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

function dollarsToCents(value: string): number | null | string {
  const trimmed = value.trim().replace(/[$,]/g, '');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return 'Price cannot be negative.';
  return Math.round(parsed * 100);
}
