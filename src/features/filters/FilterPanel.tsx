import { Pressable, ScrollView, Text, View } from 'react-native';

import { ChoiceRow, Field } from '@/components/ui';
import { useDealerShop } from '@/data/dealers';
import { useFacets } from '@/data/search';
import { HIT_TARGET, inset, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { facetsOf } from './facets';
import { useFilters, type Surface } from './provider';
import { humanize } from '@/lib/format';

import {
  ERA_PRESETS,
  PRICE_PRESETS,
  SIZE_PRESETS,
  activeCount,
  centsFromInput,
  dollarsForInput,
  isPricePreset,
} from './types';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(panelStyles);
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.choices}>{children}</View>
    </View>
  );
}

/**
 * Every filter in one scrolling panel. Options come from `listing_facets`, so a
 * brand only appears once a listing on this screen is that brand — offering a
 * filter that can only return nothing is a dead end the user has to back out of.
 * A shop counts from the watches it already loaded, for the same reason.
 *
 * Price is two number fields with presets. There is no search box here —
 * typing a brand name is a question, and questions belong on the search tab.
 */
export function FilterPanel({ surface, dealerId }: { surface: Surface; dealerId?: string }) {
  const styles = useThemedStyles(panelStyles);
  const { filters, toggle, setPrice, togglePrice, clear } = useFilters(surface, dealerId);
  const { data: catalogue = [] } = useFacets(surface === 'deck', surface !== 'shop');
  const shop = useDealerShop(surface === 'shop' ? (dealerId ?? '') : '');
  const facets = surface === 'shop' ? facetsOf(shop.data?.listings ?? []) : catalogue;

  const of = (kind: string) => facets.filter((facet) => facet.kind === kind);
  const count = activeCount(filters);
  // The boxes can show one band. Several selected prices have no single pair.
  const typedPrice = filters.prices.length === 1 ? filters.prices[0] : { min: null, max: null };

  return (
    <ScrollView
      style={styles.panel}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Price</Text>
        <View style={styles.range}>
          <Field
            value={dollarsForInput(typedPrice.min)}
            onChangeText={(text) => setPrice(centsFromInput(text), typedPrice.max)}
            placeholder="$ min"
            keyboardType="number-pad"
            style={styles.rangeField}
          />
          <Text style={styles.rangeJoin}>to</Text>
          <Field
            value={dollarsForInput(typedPrice.max)}
            onChangeText={(text) => setPrice(typedPrice.min, centsFromInput(text))}
            placeholder="$ max"
            keyboardType="number-pad"
            style={styles.rangeField}
          />
        </View>
        {/* One selected band fills the boxes. Two bands are not one pair of
            numbers, so the boxes stay empty until someone types, and typing
            then replaces the bands with that pair. */}
        <View style={styles.choices}>
          {PRICE_PRESETS.map((preset) => (
            <ChoiceRow
              key={preset.id}
              label={preset.label}
              selected={isPricePreset(filters, preset)}
              onPress={() => togglePrice(preset)}
            />
          ))}
        </View>
      </View>

      <Group title="Era">
        {ERA_PRESETS.map((preset) => (
          <ChoiceRow
            key={preset.id}
            label={preset.label}
            selected={filters.eras.includes(preset.id)}
            onPress={() => toggle('eras', preset.id)}
          />
        ))}
      </Group>

      <Group title="Case size">
        {SIZE_PRESETS.map((preset) => (
          <ChoiceRow
            key={preset.id}
            label={preset.label}
            selected={filters.sizes.includes(preset.id)}
            onPress={() => toggle('sizes', preset.id)}
          />
        ))}
      </Group>

      {of('brand').length ? (
        <Group title="Brand">
          {of('brand').map((facet) => (
            <ChoiceRow
              key={facet.value}
              label={facet.label}
              count={facet.count}
              selected={filters.brands.includes(facet.value)}
              onPress={() => toggle('brands', facet.value)}
            />
          ))}
        </Group>
      ) : null}

      {of('dealer').length > 1 ? (
        <Group title="Dealer">
          {of('dealer').map((facet) => (
            <ChoiceRow
              key={facet.value}
              label={facet.label}
              count={facet.count}
              selected={filters.dealers.includes(facet.value)}
              onPress={() => toggle('dealers', facet.value)}
            />
          ))}
        </Group>
      ) : null}

      {of('style').length ? (
        <Group title="Style">
          {of('style').map((facet) => (
            <ChoiceRow
              key={facet.value}
              label={humanize(facet.label)}
              count={facet.count}
              selected={filters.styles.includes(facet.value as never)}
              onPress={() => toggle('styles', facet.value as never)}
            />
          ))}
        </Group>
      ) : null}

      {of('case_material').length ? (
        <Group title="Case">
          {of('case_material').map((facet) => (
            <ChoiceRow
              key={facet.value}
              label={humanize(facet.label)}
              count={facet.count}
              selected={filters.materials.includes(facet.value as never)}
              onPress={() => toggle('materials', facet.value as never)}
            />
          ))}
        </Group>
      ) : null}

      {of('winding').length ? (
        <Group title="Winding">
          {of('winding').map((facet) => (
            <ChoiceRow
              key={facet.value}
              label={humanize(facet.label)}
              count={facet.count}
              selected={filters.windings.includes(facet.value as never)}
              onPress={() => toggle('windings', facet.value as never)}
            />
          ))}
        </Group>
      ) : null}

      {of('complication').length ? (
        <Group title="Complications">
          {of('complication').map((facet) => (
            <ChoiceRow
              key={facet.value}
              label={humanize(facet.label)}
              count={facet.count}
              selected={filters.complications.includes(facet.value as never)}
              onPress={() => toggle('complications', facet.value as never)}
            />
          ))}
        </Group>
      ) : null}

      {count ? (
        <Pressable accessibilityRole="button" onPress={clear} style={styles.clear}>
          <Text style={styles.clearLabel}>Clear {count} filter{count === 1 ? '' : 's'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const panelStyles = (theme: Theme) => ({
  panel: {
    flex: 1,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
    gap: stack.group,
  },
  group: {
    gap: stack.tight,
  },
  groupTitle: {
    ...type.eyebrow,
    color: theme.color.textMuted,
    paddingBottom: space.xs,
  },
  choices: {
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  range: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingBottom: space.sm,
  },
  rangeField: {
    flex: 1,
  },
  rangeJoin: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  clear: {
    alignSelf: 'flex-start' as const,
    paddingVertical: space.md,
  },
  clearLabel: {
    ...type.control,
    color: theme.color.danger,
  },
});
