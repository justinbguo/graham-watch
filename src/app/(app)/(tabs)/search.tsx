import { FlatList, Text, View } from 'react-native';

import { FilterButton } from '@/components/FilterButton';
import { ListingRow } from '@/components/ListingRow';
import { Field, Message, Screen, Spinner } from '@/components/ui';
import { usePrimeListing } from '@/data/listings';
import { useSearch } from '@/data/search';
import { useOpenFilters } from '@/features/filters/open';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Search() {
  const styles = useThemedStyles(searchStyles);
  const open = useOpenStack();
  const primeListing = usePrimeListing();
  const { filters, setOne } = useFilters('search');
  const openFilters = useOpenFilters();
  const { data: results = [], isPending, error } = useSearch(filters);

  // The typed query is a filter like any other, but it is the one people reach
  // for first, so it stays on the screen instead of behind the funnel.
  const chipCount = activeCount(filters) - (filters.query.trim() ? 1 : 0);

  return (
    <Screen
      title="Search"
      inTabs
      action={
        <FilterButton count={chipCount} onPress={() => openFilters('search')} />
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
            <ListingRow
              card={item}
              onPress={() => {
                primeListing(item);
                // The page cannot tell a search result from a deck card on its
                // own, and the two carry different verdicts.
                open(
                  'listing/[listingId]',
                  { listingId: item.id, from: 'search' },
                  `/listing/${item.id}?from=search`
                );
              }}
            />
          )}
        />
      )}
    </Screen>
  );
}

const searchStyles = (theme: Theme) => ({
  queryRow: {
    // The header leaves space.lg under every title. This field is that title's
    // own control, so it sits space.sm under "Search". Saved and Profile keep
    // the wider gap.
    marginTop: space.sm - space.lg,
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
    gap: space.lg,
  },
  state: {
    padding: inset.screen,
  },
});
