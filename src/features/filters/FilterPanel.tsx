import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CheckRow } from '@/components/CheckRow';
import { Field } from '@/components/ui';
import { useDealerDirectory, useDealerShop } from '@/data/dealers';
import { useNewListings } from '@/data/newListings';
import { useFilterFacets } from '@/data/search';
import { inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { filterChips } from './chips';
import { DEALER_NAME_PLACEHOLDER, dealerChoices, dealerDisplayName } from './dealers';
import { facetsOf, UNKNOWN_FACET_VALUE } from './facets';
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

const NO_DIRECTORY: { id: string; name: string }[] = [];

/**
 * Price, era, size, brand, and every dealer this surface can actually show.
 * Deck and search ask `listing_facets_v2` with the canonical spec, so a count
 * beside a brand already reflects the price and the era, and not the brand
 * you have selected. A shop counts the watches already on the page: a claimed
 * shop would vanish from that function. Unknown is a bucket for the total,
 * not a choice, so it is not offered.
 */
export function FilterPanel({
  surface,
  dealerId,
  variant = 'sheet',
  showDealers = true,
}: {
  surface: Surface;
  dealerId?: string;
  variant?: 'sheet' | 'dropdown';
  /** First-run omits shops. Filter itself still lists them, above Brand. */
  showDealers?: boolean;
}) {
  const styles = useThemedStyles(panelStyles);
  const dropdown = variant === 'dropdown';
  const api = useFilters(surface, dealerId);
  const { filters, toggle, setPrice, togglePrice, replace, clear } = api;
  const { data: catalogue = [] } = useFilterFacets(filters, {
    excludeOwn: surface === 'deck',
    excludeSwiped: surface === 'deck',
    enabled: surface !== 'shop' && surface !== 'new',
  });
  const shop = useDealerShop(surface === 'shop' ? (dealerId ?? '') : '');
  const newest = useNewListings({ enabled: surface === 'new', pageAll: surface === 'new' });
  const facets = (
    surface === 'shop'
      ? facetsOf(shop.data?.listings ?? [], filters)
      : surface === 'new'
        ? facetsOf(newest.state === 'ready' ? newest.cards : [], filters)
        : catalogue
  ).filter((facet) => facet.value !== UNKNOWN_FACET_VALUE);
  const matched = useFilterMatchCount(surface, dealerId);

  const of = (kind: string) => facets.filter((facet) => facet.kind === kind);
  const dealers = dealerChoices(facets, surface);
  const { data: directory = NO_DIRECTORY } = useDealerDirectory();
  const dealerLabel = useCallback(
    (id: string, facetLabel?: string) =>
      dealerDisplayName(id, [{ id, name: facetLabel }, ...directory]) ?? DEALER_NAME_PLACEHOLDER,
    [directory],
  );
  const labelFor = useCallback(
    (kind: string, value: string) => {
      const facetLabel = of(kind).find((facet) => facet.value === value)?.label;
      if (kind === 'dealer') return dealerLabel(value, facetLabel);
      return facetLabel ?? value;
    },
    [dealerLabel, facets],
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
    <View style={[styles.panel, dropdown && styles.panelDropdown]}>
      <FilterSummary matched={matched} chips={chips} onClear={clear} compact={dropdown} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, dropdown && styles.contentDropdown]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={dropdown}>
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

        {showDealers && dealers.length ? (
          <FilterGroup title="Dealer" selectedCount={filters.dealers.length || undefined}>
            {rows(
              dealers.map((facet) => ({
                key: facet.value,
                label: dealerLabel(facet.value, facet.label),
                count: facet.count,
                selected: filters.dealers.includes(facet.value),
                onPress: () => toggle('dealers', facet.value),
              })),
            )}
          </FilterGroup>
        ) : null}

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
      </ScrollView>
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  panel: {
    flex: 1,
  },
  panelDropdown: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: stack.group,
  },
  contentDropdown: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: stack.section,
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
