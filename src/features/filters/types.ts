import type { CaseMaterial, Complication, WatchStyle, Winding } from '@/lib/models';

import { canonicalize } from './spec.ts';

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

/** One inclusive band. A null end is open: under $5k is `{ min: null, max }`. */
export type Range = { min: number | null; max: number | null };

export type Filters = {
  query: string;
  brands: string[];
  /** Dealer ids. */
  dealers: string[];
  styles: WatchStyle[];
  materials: CaseMaterial[];
  windings: Winding[];
  complications: Complication[];
  /** Chosen price bands, in cents. The panel types dollars. */
  prices: Range[];
  /** Preset ids. Several means any of them. */
  sizes: string[];
  eras: string[];
};

export const NO_FILTERS: Filters = {
  query: '',
  brands: [],
  dealers: [],
  styles: [],
  materials: [],
  windings: [],
  complications: [],
  prices: [],
  sizes: [],
  eras: [],
};

/** Digits only: a price box that accepts "1,2OO" and silently means 12 is worse. */
export function centsFromInput(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number(digits) * 100 : null;
}

export function dollarsForInput(cents: number | null): string {
  return cents == null ? '' : String(Math.round(cents / 100));
}

export function sameRange(a: Range, b: Range): boolean {
  return a.min === b.min && a.max === b.max;
}

export function isPricePreset(filters: Filters, preset: Preset): boolean {
  return filters.prices.some((range) => sameRange(range, preset));
}

/** Add the band, or remove it when it is already chosen. */
export function toggleRange(list: Range[], range: Range): Range[] {
  return list.some((item) => sameRange(item, range))
    ? list.filter((item) => !sameRange(item, range))
    : [...list, range];
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
    filters.prices.length +
    filters.sizes.length +
    filters.eras.length
  );
}

/**
 * An unset filter is left out of the call entirely rather than sent as null, so
 * the function's own defaults apply. JSON.stringify drops undefined keys, which
 * is what makes omission work over the wire.
 */
const orSkip = <T>(values: T[]) => (values.length ? values : undefined);

function rangesFor(presets: Preset[], ids: string[]): Range[] {
  return ids.flatMap((id) => {
    const preset = presets.find((item) => item.id === id);
    return preset ? [{ min: preset.min, max: preset.max }] : [];
  });
}

/**
 * Open ends stay null inside the arrays. `undefined` would drop the element
 * and pair a floor with the wrong ceiling.
 */
function bands(ranges: Range[]) {
  if (!ranges.length) return { mins: undefined, maxs: undefined };
  return {
    mins: ranges.map((range) => range.min),
    maxs: ranges.map((range) => range.max),
  };
}

/**
 * The shop the deck is showing, when the filter names exactly one.
 * Zero shops and two shops are both no header. The cards are not consulted.
 */
export function soleDealer(filters: Filters): string | null {
  const dealers = canonicalize(filters).spec.dealers;
  if (!dealers || dealers.length !== 1) return null;
  return dealers[0] ?? null;
}

/**
 * Set the deck to one shop, or clear that cut.
 * A repeat that would write the same dealers returns the same object, so the
 * setter can skip the update.
 */
export function scopeDealer(filters: Filters, dealerId: string | null): Filters {
  if (dealerId === null) {
    if (filters.dealers.length === 0) return filters;
    return { ...filters, dealers: [] };
  }
  const dealers = canonicalize(filters).spec.dealers;
  if (dealers?.length === 1 && dealers[0] === dealerId) return filters;
  return { ...filters, dealers: [dealerId] };
}

export function toRpcArgs(filters: Filters) {
  const price = bands(filters.prices);
  const size = bands(rangesFor(SIZE_PRESETS, filters.sizes));
  const era = bands(rangesFor(ERA_PRESETS, filters.eras));

  return {
    p_query: filters.query.trim() || undefined,
    p_brands: orSkip(filters.brands),
    p_dealers: orSkip(filters.dealers),
    p_styles: orSkip(filters.styles),
    p_materials: orSkip(filters.materials),
    p_windings: orSkip(filters.windings),
    p_complications: orSkip(filters.complications),
    p_price_mins: price.mins,
    p_price_maxs: price.maxs,
    p_size_mins: size.mins,
    p_size_maxs: size.maxs,
    p_year_mins: era.mins,
    p_year_maxs: era.maxs,
  };
}
