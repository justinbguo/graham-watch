import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CheckRow } from '@/components/CheckRow';
import { Field } from '@/components/ui';
import { useDealerShop } from '@/data/dealers';
import { useFacets } from '@/data/search';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { filterChips } from './chips';
import { facetsOf } from './facets';
import { FilterGroup } from './FilterGroup';
import { FilterSummary } from './FilterSummary';
import { useFilters, type Surface } from './provider';
import { useFilterMatchCount } from './useMatchCount';
import {
  ERA_PRESETS,
  PRICE_PRESETS,
  SIZE_PRESETS,
  centsFromInput,
  dollarsForInput,
  isPricePreset,
} from './types';

/**
 * Price, era, size, brand, and dealer when the catalogue has more than one.
 * Options come from `listing_facets` so nothing offered can only return zero rows.
 */
export function FilterPanel({ surface, dealerId }: { surface: Surface; dealerId?: string }) {
  const styles = useThemedStyles(panelStyles);
  const api = useFilters(surface, dealerId);
  const { filters, toggle, setPrice, togglePrice, replace, clear } = api;
  const { data: catalogue = [] } = useFacets(surface === 'deck', surface !== 'shop');
  const shop = useDealerShop(surface === 'shop' ? (dealerId ?? '') : '');
  const facets = surface === 'shop' ? facetsOf(shop.data?.listings ?? []) : catalogue;
  const matched = useFilterMatchCount(surface, dealerId);

  const of = (kind: string) => facets.filter((facet) => facet.kind === kind);
  const labelFor = useCallback(
    (kind: string, value: string) =>
      of(kind).find((facet) => facet.value === value)?.label ?? value,
    [facets],
  );

  const chips = useMemo(
    () =>
      filterChips(filters, {
        toggle,
        togglePrice,
        setPrices: (next) => replace({ ...filters, prices: next }),
        labelFor,
      }),
    [filters, toggle, togglePrice, replace, labelFor],
  );

  const typedPrice = filters.prices.length === 1 ? filters.prices[0] : { min: null, max: null };

  const rows = (items: { key: string; label: string; count?: number; selected: boolean; onPress: () => void }[]) =>
    items.map((item, index) => (
      <CheckRow
        key={item.key}
        label={item.label}
        count={item.count}
        selected={item.selected}
        onPress={item.onPress}
        divider={index < items.length - 1}
      />
    ));

  return (
    <View style={styles.panel}>
      <FilterSummary matched={matched} chips={chips} onClear={clear} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <FilterGroup title="Price" selectedCount={filters.prices.length || undefined}>
          <View style={styles.range}>
            <Field
              compact
              value={dollarsForInput(typedPrice.min)}
              onChangeText={(text) => setPrice(centsFromInput(text), typedPrice.max)}
              placeholder="$ min"
              keyboardType="number-pad"
              style={styles.rangeField}
            />
            <Text style={styles.rangeJoin}>to</Text>
            <Field
              compact
              value={dollarsForInput(typedPrice.max)}
              onChangeText={(text) => setPrice(typedPrice.min, centsFromInput(text))}
              placeholder="$ max"
              keyboardType="number-pad"
              style={styles.rangeField}
            />
          </View>
          {rows(
            PRICE_PRESETS.map((preset) => ({
              key: preset.id,
              label: preset.label,
              selected: isPricePreset(filters, preset),
              onPress: () => togglePrice(preset),
            })),
          )}
        </FilterGroup>

        <FilterGroup title="Era" selectedCount={filters.eras.length || undefined}>
          {rows(
            ERA_PRESETS.map((preset) => ({
              key: preset.id,
              label: preset.label,
              selected: filters.eras.includes(preset.id),
              onPress: () => toggle('eras', preset.id),
            })),
          )}
        </FilterGroup>

        <FilterGroup title="Case size" selectedCount={filters.sizes.length || undefined}>
          {rows(
            SIZE_PRESETS.map((preset) => ({
              key: preset.id,
              label: preset.label,
              selected: filters.sizes.includes(preset.id),
              onPress: () => toggle('sizes', preset.id),
            })),
          )}
        </FilterGroup>

        {of('brand').length ? (
          <FilterGroup title="Brand" selectedCount={filters.brands.length || undefined}>
            {rows(
              of('brand').map((facet) => ({
                key: facet.value,
                label: facet.label,
                count: facet.count,
                selected: filters.brands.includes(facet.value),
                onPress: () => toggle('brands', facet.value),
              })),
            )}
          </FilterGroup>
        ) : null}

        {of('dealer').length > 1 ? (
          <FilterGroup title="Dealer" selectedCount={filters.dealers.length || undefined}>
            {rows(
              of('dealer').map((facet) => ({
                key: facet.value,
                label: facet.label,
                count: facet.count,
                selected: filters.dealers.includes(facet.value),
                onPress: () => toggle('dealers', facet.value),
              })),
            )}
          </FilterGroup>
        ) : null}
      </ScrollView>
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  panel: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: stack.group,
  },
  range: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  rangeField: {
    flex: 1,
  },
  rangeJoin: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
