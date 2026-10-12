import { useCallback, useRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { FilterButton } from '@/components/FilterButton';
import { CloseButton, Field, Message, Screen, Spinner } from '@/components/ui';
import { usePrimeListing } from '@/data/listings';
import { useSearch, useSearchCount } from '@/data/search';
import { useOpenFilters } from '@/features/filters/open';
import { ExploreGrid } from '@/features/search/ExploreGrid';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useOpenStack, useOpenTab } from '@/lib/openStack';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export { TabErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Search() {
  const styles = useThemedStyles(searchStyles);
  const open = useOpenStack();
  const openTab = useOpenTab();
  const primeListing = usePrimeListing();
  const { filters, setOne } = useFilters('search');
  const openFilters = useOpenFilters();
  const { data: results = [], isPending, error, refetch } = useSearch(filters);
  const { data: matched, refetch: refetchCount } = useSearchCount(filters);
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const field = useRef<TextInput>(null);

  // A tab stays mounted, so leaving to approve a shop and coming back would
  // otherwise keep the number from the last visit.
  useFocusEffect(
    useCallback(() => {
      void refetch();
      void refetchCount();
    }, [refetch, refetchCount]),
  );

  // The deck's door is a field you cannot type into. Focus the real one so
  // the keyboard is up when you arrive. Coming back from a listing has no
  // `compose`, and popping the keyboard over results you were reading is worse.
  useFocusEffect(
    useCallback(() => {
      if (compose !== '1') return;
      const frame = requestAnimationFrame(() => {
        field.current?.focus();
        router.setParams({ compose: '' });
      });
      return () => cancelAnimationFrame(frame);
    }, [compose]),
  );

  // The typed query is a filter like any other, but it is the one people reach
  // for first, so it stays on the screen instead of behind the funnel.
  const chipCount = activeCount(filters) - (filters.query.trim() ? 1 : 0);

  return (
    <Screen
      title="Search"
      inTabs
      leading={
        <CloseButton
          edge="start"
          onPress={() => {
            field.current?.blur();
            openTab('index');
          }}
        />
      }
      action={
        <FilterButton count={chipCount} onPress={() => openFilters('search')} />
      }>
      <View style={styles.queryRow}>
        <Field
          ref={field}
          placeholder="Search brand, model or reference"
          value={filters.query}
          onChangeText={(text) => setOne('query', text)}
          returnKeyType="search"
        />
        <Text style={styles.count}>
          {matched == null ? ' ' : `${matched} watch${matched === 1 ? '' : 'es'}`}
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
        <ExploreGrid
          cards={results}
          onOpen={(item) => {
            field.current?.blur();
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
    </Screen>
  );
}

const searchStyles = (theme: Theme) => ({
  queryRow: {
    // The header leaves space.lg under every title. This field is that title's
    // own control, so it sits space.sm under "Search". Wishlist keeps the wider
    // gap. Profile pulls up to space.md.
    marginTop: space.sm - space.lg,
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
    gap: space.sm,
  },
  count: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  state: {
    padding: inset.screen,
  },
});
