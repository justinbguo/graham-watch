import type { CaseMaterial, Complication, WatchStyle, Winding } from '@/lib/models';

/**
 * Size and era are presets rather than sliders. Dragging two handles to "36 to
 * 39mm" is slow on a phone and precision buys nothing there — nobody wants a
 * 37.5mm floor. Price is the exception: a budget is a number people already
 * know, so it is typed, and the presets only fill the boxes.
 */
export type Preset = { id: string; label: string; min: number | null; max: number | null };

export const PRICE_PRESETS: Preset[] = [
  { id: 'under5k', label: 'Under $5k', min: null, max: 500_000 },
  { id: '5to15k', label: '$5k–15k', min: 500_000, max: 1_500_000 },
  { id: '15to50k', label: '$15k–50k', min: 1_500_000, max: 5_000_000 },
  { id: 'over50k', label: '$50k+', min: 5_000_000, max: null },
];

export const SIZE_PRESETS: Preset[] = [
  { id: 'small', label: 'Under 34mm', min: null, max: 34 },
  { id: 'mid', label: '34–36mm', min: 34, max: 36 },
  { id: 'large', label: '36–39mm', min: 36, max: 39 },
  { id: 'xlarge', label: '39mm+', min: 39, max: null },
];

export const ERA_PRESETS: Preset[] = [
  { id: 'prewar', label: 'Pre-1950', min: null, max: 1949 },
  { id: 'fifties', label: '1950s', min: 1950, max: 1959 },
  { id: 'sixties', label: '1960s', min: 1960, max: 1969 },
  { id: 'seventies', label: '1970s', min: 1970, max: 1979 },
  { id: 'modern', label: '1980s+', min: 1980, max: null },
];

export type Filters = {
  query: string;
  brands: string[];
  /** Dealer ids. */
  dealers: string[];
  styles: WatchStyle[];
  materials: CaseMaterial[];
  windings: Winding[];
  complications: Complication[];
  /** Cents, to match `listings.price_cents`. The panel types dollars. */
  priceMin: number | null;
  priceMax: number | null;
  size: string | null;
  era: string | null;
};

export const NO_FILTERS: Filters = {
  query: '',
  brands: [],
  dealers: [],
  styles: [],
  materials: [],
  windings: [],
  complications: [],
  priceMin: null,
  priceMax: null,
  size: null,
  era: null,
};

const find = (presets: Preset[], id: string | null) => presets.find((p) => p.id === id) ?? null;

/** Digits only: a price box that accepts "1,2OO" and silently means 12 is worse. */
export function centsFromInput(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number(digits) * 100 : null;
}

export function dollarsForInput(cents: number | null): string {
  return cents == null ? '' : String(Math.round(cents / 100));
}

export function isPricePreset(filters: Filters, preset: Preset): boolean {
  return filters.priceMin === preset.min && filters.priceMax === preset.max;
}

/** How many choices the user has made. Drives the badge on the filter button. */
export function activeCount(filters: Filters): number {
  return (
    (filters.query.trim() ? 1 : 0) +
    filters.brands.length +
    filters.dealers.length +
    filters.styles.length +
    filters.materials.length +
    filters.windings.length +
    filters.complications.length +
    // A range is one choice however many ends of it are set.
    (filters.priceMin != null || filters.priceMax != null ? 1 : 0) +
    (filters.size ? 1 : 0) +
    (filters.era ? 1 : 0)
  );
}

/**
 * An unset filter is left out of the call entirely rather than sent as null, so
 * the function's own defaults apply. JSON.stringify drops undefined keys, which
 * is what makes omission work over the wire.
 */
const orSkip = <T>(values: T[]) => (values.length ? values : undefined);

export function toRpcArgs(filters: Filters) {
  const size = find(SIZE_PRESETS, filters.size);
  const era = find(ERA_PRESETS, filters.era);

  return {
    p_query: filters.query.trim() || undefined,
    p_brands: orSkip(filters.brands),
    p_dealers: orSkip(filters.dealers),
    p_styles: orSkip(filters.styles),
    p_materials: orSkip(filters.materials),
    p_windings: orSkip(filters.windings),
    p_complications: orSkip(filters.complications),
    p_price_min: filters.priceMin ?? undefined,
    p_price_max: filters.priceMax ?? undefined,
    p_size_min: size?.min ?? undefined,
    p_size_max: size?.max ?? undefined,
    p_year_min: era?.min ?? undefined,
    p_year_max: era?.max ?? undefined,
  };
}
