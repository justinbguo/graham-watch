import { Pressable, ScrollView, Text, View } from 'react-native';

import { useFacets } from '@/data/search';
import { Field } from '@/components/ui';
import { inset, radius, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { useFilters } from './provider';
import { ERA_PRESETS, PRICE_PRESETS, SIZE_PRESETS, activeCount, humanize } from './types';

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
 */
export function FilterPanel({ showQuery = true }: { showQuery?: boolean }) {
  const styles = useThemedStyles(panelStyles);
  const { filters, toggle, setOne, clear } = useFilters();
  const { data: facets = [] } = useFacets();

  const of = (kind: string) => facets.filter((facet) => facet.kind === kind);
  const count = activeCount(filters);

  return (
    <ScrollView
      style={styles.panel}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {showQuery ? (
        <Field
          placeholder="Search brand, model or reference"
          value={filters.query}
          onChangeText={(text) => setOne('query', text)}
          returnKeyType="search"
        />
      ) : null}

      <Group title="Price">
        {PRICE_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            label={preset.label}
            selected={filters.price === preset.id}
            onPress={() => setOne('price', preset.id)}
          />
        ))}
      </Group>

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
    paddingBottom: space.xxxl,
    gap: stack.section,
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
    paddingHorizontal: inset.controlX,
    paddingVertical: space.sm,
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
