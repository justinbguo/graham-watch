import {
  ERA_PRESETS,
  PRICE_PRESETS,
  SIZE_PRESETS,
  dollarsForInput,
  isPricePreset,
  sameRange,
  toggleRange,
  type Filters,
  type Preset,
  type Range,
} from './types';

export type FilterChip = {
  key: string;
  label: string;
  remove: () => void;
};

function customPriceLabel(band: Range): string {
  const min = dollarsForInput(band.min);
  const max = dollarsForInput(band.max);
  if (min && max) return `$${min}–${max}`;
  if (min) return `$${min}+`;
  if (max) return `Under $${max}`;
  return 'Price';
}

function presetChips(
  prefix: string,
  presets: Preset[],
  ids: string[],
  remove: (id: string) => void,
): FilterChip[] {
  return ids.flatMap((id) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return [];
    return [{ key: `${prefix}-${id}`, label: preset.label, remove: () => remove(id) }];
  });
}

export function filterChips(
  filters: Filters,
  api: {
    toggle: <K extends 'brands' | 'dealers' | 'sizes' | 'eras'>(
      key: K,
      value: Filters[K][number],
    ) => void;
    togglePrice: (preset: Preset) => void;
    setPrices: (next: Range[]) => void;
    labelFor: (kind: string, value: string) => string;
  },
): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const preset of PRICE_PRESETS) {
    if (!isPricePreset(filters, preset)) continue;
    chips.push({
      key: `price-${preset.id}`,
      label: preset.label,
      remove: () => api.togglePrice(preset),
    });
  }

  for (const band of filters.prices) {
    if (PRICE_PRESETS.some((preset) => sameRange(band, { min: preset.min, max: preset.max }))) {
      continue;
    }
    chips.push({
      key: `price-${band.min ?? 'o'}-${band.max ?? 'o'}`,
      label: customPriceLabel(band),
      remove: () => api.setPrices(toggleRange(filters.prices, band)),
    });
  }

  chips.push(
    ...presetChips('era', ERA_PRESETS, filters.eras, (id) => api.toggle('eras', id)),
    ...presetChips('size', SIZE_PRESETS, filters.sizes, (id) => api.toggle('sizes', id)),
  );

  for (const id of filters.brands) {
    chips.push({
      key: `brand-${id}`,
      label: api.labelFor('brand', id),
      remove: () => api.toggle('brands', id),
    });
  }
  for (const id of filters.dealers) {
    chips.push({
      key: `dealer-${id}`,
      label: api.labelFor('dealer', id),
      remove: () => api.toggle('dealers', id),
    });
  }
  return chips;
}
