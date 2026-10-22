import { useCallback, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { FilterMenu } from '@/features/filters/FilterMenu';
import { SearchField } from '@/components/SearchBar';
import { CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { usePrimeListing } from '@/data/listings';
import { useSearch } from '@/data/search';
import { ExploreGrid } from '@/features/search/ExploreGrid';
import { SearchMorph } from '@/features/search/SearchMorph';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import type { SearchBarRect } from '@/lib/searchLaunch';
import { takeSearchLaunchRect } from '@/lib/searchLaunch';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ErrorState';

export default function Search() {
  const styles = useThemedStyles(searchStyles);
  const open = useOpenStack();
  const primeListing = usePrimeListing();
  const { filters, setOne } = useFilters('search');
  const { data: results = [], isPending, error, refetch } = useSearch(filters);
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  const root = useRef<View>(null);
  const field = useRef<TextInput>(null);
  const barAnchor = useRef<View>(null);
  const [morph, setMorph] = useState<{ from: SearchBarRect; to: SearchBarRect } | null>(null);
  const [fieldReady, setFieldReady] = useState(false);

  const localize = (rect: SearchBarRect, origin: SearchBarRect) => ({
    x: rect.x - origin.x,
    y: rect.y - origin.y,
    width: rect.width,
    height: rect.height,
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  useFocusEffect(
    useCallback(() => {
      const from = takeSearchLaunchRect();
      if (!from) {
        setFieldReady(true);
        return;
      }
      setFieldReady(false);
      const frame = requestAnimationFrame(() => {
        root.current?.measureInWindow((ox, oy, ow, oh) => {
          const origin = { x: ox, y: oy, width: ow, height: oh };
          if (!barAnchor.current) {
            setFieldReady(true);
            return;
          }
          barAnchor.current.measureInWindow((x, y, width, height) => {
            if (width <= 0 || height <= 0) {
              setFieldReady(true);
              return;
            }
            setMorph({
              from: localize(from, origin),
              to: localize({ x, y, width, height }, origin),
            });
          });
        });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (!fieldReady || compose !== '1') return;
      const frame = requestAnimationFrame(() => {
        field.current?.focus();
        router.setParams({ compose: '' });
      });
      return () => cancelAnimationFrame(frame);
    }, [compose, fieldReady]),
  );

  const finishMorph = useCallback(() => {
    setMorph(null);
    setFieldReady(true);
  }, []);

  const chipCount = activeCount(filters) - (filters.query.trim() ? 1 : 0);

  return (
    <View ref={root} style={styles.root}>
    <Screen
      inSheet
      leading={
        <CloseButton
          edge="start"
          onPress={() => {
            field.current?.blur();
            if (router.canDismiss()) router.dismiss();
            else router.back();
          }}
        />
      }
      titleControl={
        <View ref={barAnchor} collapsable={false} style={styles.barSlot}>
          <SearchField
            ref={field}
            accessibilityLabel="Search brand, model or reference"
            placeholder=""
            value={filters.query}
            onChangeText={(text) => setOne('query', text)}
            style={fieldReady ? undefined : styles.fieldHidden}
          />
        </View>
      }
      action={<FilterMenu surface="search" count={chipCount} />}>
      <View style={styles.body}>
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
              open(
                'listing/[listingId]',
                { listingId: item.id, from: 'search' },
                `/listing/${item.id}?from=search`
              );
            }}
          />
        )}
      </View>
    </Screen>
    {morph ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SearchMorph from={morph.from} to={morph.to} onDone={finishMorph} />
      </View>
    ) : null}
    </View>
  );
}

const searchStyles = (theme: Theme) => ({
  root: {
    flex: 1,
  },
  barSlot: {
    flex: 1,
    alignSelf: 'stretch' as const,
    minWidth: 0,
  },
  fieldHidden: {
    opacity: 0,
  },
  body: {
    flex: 1,
    // Header pads `space.lg` under the bar; leave `space.sm` before the grid.
    marginTop: -(space.lg - space.sm),
  },
  state: {
    padding: inset.screen,
  },
});
