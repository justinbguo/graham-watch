import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ListingRow } from '@/components/ListingRow';
import { Message, Screen, Spinner } from '@/components/ui';
import { useSearch } from '@/data/search';
import { FilterPanel } from '@/features/filters/FilterPanel';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export default function Search() {
  const styles = useThemedStyles(searchStyles);
  const router = useRouter();
  const { filters } = useFilters();
  const { data: results = [], isPending, error } = useSearch(filters);
  const [showFilters, setShowFilters] = useState(true);

  const count = activeCount(filters);

  return (
    <Screen title="Search">
      <View style={styles.toggleRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowFilters((open) => !open)}
          style={styles.toggle}>
          <Text style={styles.toggleLabel}>
            {showFilters ? 'Hide filters' : 'Show filters'}
            {count ? ` · ${count}` : ''}
          </Text>
        </Pressable>
        <Text style={styles.count}>
          {isPending ? '' : `${results.length} watch${results.length === 1 ? '' : 'es'}`}
        </Text>
      </View>

      {showFilters ? <FilterPanel /> : null}

      {error ? (
        <View style={styles.state}>
          <Message text={error.message} tone="error" />
        </View>
      ) : isPending ? (
        <Spinner />
      ) : results.length === 0 ? (
        <View style={styles.state}>
          <Message text="No watches match. Loosen a filter." />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(card) => card.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <ListingRow card={item} onPress={() => router.push(`/inquiry/${item.id}`)} />
          )}
        />
      )}
    </Screen>
  );
}

const searchStyles = (theme: Theme) => ({
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
  },
  toggle: {
    paddingVertical: space.sm,
  },
  toggleLabel: {
    ...type.control,
    color: theme.color.brass,
  },
  count: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  state: {
    padding: inset.screen,
  },
});
