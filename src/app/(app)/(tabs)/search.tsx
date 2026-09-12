import { useRouter } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

import { FilterButton } from '@/components/FilterButton';
import { ListingRow } from '@/components/ListingRow';
import { Field, Message, Screen, Spinner } from '@/components/ui';
import { useSearch } from '@/data/search';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export default function Search() {
  const styles = useThemedStyles(searchStyles);
  const router = useRouter();
  const { filters, setOne } = useFilters('search');
  const { data: results = [], isPending, error } = useSearch(filters);

  // The typed query is a filter like any other, but it is the one people reach
  // for first, so it stays on the screen instead of behind the funnel.
  const chipCount = activeCount(filters) - (filters.query.trim() ? 1 : 0);

  return (
    <Screen
      title="Search"
      action={
        <FilterButton count={chipCount} onPress={() => router.push('/filters/search')} />
      }>
      <View style={styles.queryRow}>
        <Field
          placeholder="Search brand, model or reference"
          value={filters.query}
          onChangeText={(text) => setOne('query', text)}
          returnKeyType="search"
        />
        <Text style={styles.count}>
          {isPending ? ' ' : `${results.length} watch${results.length === 1 ? '' : 'es'}`}
        </Text>
      </View>

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
            <ListingRow card={item} onPress={() => router.push(`/listing/${item.id}`)} />
          )}
        />
      )}
    </Screen>
  );
}

const searchStyles = (theme: Theme) => ({
  queryRow: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
    gap: space.sm,
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
