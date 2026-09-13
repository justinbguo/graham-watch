import { Pressable, ScrollView, Text, View } from 'react-native';

import { Field } from '@/components/ui';
import { useFacets } from '@/data/search';
import { HIT_TARGET, inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

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

function Chip({
  label,
  selected,
  count,
  onPress,
}: {
  label: string;
  selected: boolean;
  count?: number;
  onPress: () => void;
}) {
  const styles = useThemedStyles(chipStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}>
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label}
        {count ? ` ${count}` : ''}
      </Text>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useThemedStyles(panelStyles);
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

/**
 * Every filter in one scrolling panel. Options come from `listing_facets`, so a
 * brand only appears once something in the deck is that brand — offering a
 * filter that can only return nothing is a dead end the user has to back out of.
 *
 * Price is two number fields with presets. There is no search box here —
 * typing a brand name is a question, and questions belong on the search tab.
 */
export function FilterPanel({ surface }: { surface: Surface }) {
  const styles = useThemedStyles(panelStyles);
  const { filters, toggle, setOne, setPrice, clear } = useFilters(surface);
  const { data: facets = [] } = useFacets();

  const of = (kind: string) => facets.filter((facet) => facet.kind === kind);
  const count = activeCount(filters);

  return (
    <ScrollView
      style={styles.panel}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Price</Text>
        <View style={styles.range}>
          <Field
            value={dollarsForInput(filters.priceMin)}
            onChangeText={(text) => setPrice(centsFromInput(text), filters.priceMax)}
            placeholder="$ min"
            keyboardType="number-pad"
            style={styles.rangeField}
          />
          <Text style={styles.rangeJoin}>to</Text>
          <Field
            value={dollarsForInput(filters.priceMax)}
            onChangeText={(text) => setPrice(filters.priceMin, centsFromInput(text))}
            placeholder="$ max"
            keyboardType="number-pad"
            style={styles.rangeField}
          />
        </View>
        {/* Shortcuts that fill the boxes above rather than a second, competing
            way to say the same thing. Tapping the live one empties them. */}
        <View style={styles.chips}>
          {PRICE_PRESETS.map((preset) => {
            const live = isPricePreset(filters, preset);
            return (
              <Chip
                key={preset.id}
                label={preset.label}
                selected={live}
                onPress={() =>
                  live ? setPrice(null, null) : setPrice(preset.min, preset.max)
                }
              />
            );
          })}
        </View>
      </View>

      <Group title="Era">
        {ERA_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={filters.era === preset.id}
            onPress={() => setOne('era', preset.id)}
          />
        ))}
      </Group>

      <Group title="Case size">
        {SIZE_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={filters.size === preset.id}
            onPress={() => setOne('size', preset.id)}
          />
        ))}
      </Group>

      {of('brand').length ? (
        <Group title="Brand">
          {of('brand').map((facet) => (
            <Chip
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
            <Chip
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
            <Chip
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
            <Chip
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
            <Chip
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
            <Chip
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
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
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

const chipStyles = (theme: Theme) => ({
  chip: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: radius.pill,
    paddingHorizontal: inset.chipX,
    paddingVertical: inset.chipY,
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.surface,
  },
  selected: {
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.control,
    color: theme.color.text,
  },
  labelSelected: {
    color: theme.color.onAccent,
  },
});
