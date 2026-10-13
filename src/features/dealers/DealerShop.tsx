import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';

import { FilterButton } from '@/components/FilterButton';
import { ListingRow } from '@/components/ListingRow';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useDealerShop } from '@/data/dealers';
import { usePrimeListing } from '@/data/listings';
import { useOpenFilters } from '@/features/filters/open';
import { matchesListing } from '@/features/filters/match';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealerPanel } from './DealerPanel';
import { FollowDealer } from './FollowDealer';
import { MessageDealer } from './MessageDealer';

export function DealerShop({ dealerId }: { dealerId: string }) {
  const styles = useThemedStyles(shopStyles);
  const open = useOpenStack();
  const openFilters = useOpenFilters();
  const primeListing = usePrimeListing();
  const { filters } = useFilters('shop', dealerId);
  const { data, isPending, error } = useDealerShop(dealerId);
  const listings = data?.listings ?? [];
  const shown = useMemo(
    () => listings.filter((card) => matchesListing(card, filters)),
    [listings, filters],
  );
  const chosen = activeCount(filters);
  const close = () => router.back();

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Spinner />
      </Screen>
    );
  }

  if (error || !data?.dealer) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="That shop is no longer listed." tone="error" />
        </Centered>
      </Screen>
    );
  }

  const { dealer } = data;

  return (
    <Screen
      title={dealer.name}
      titleSize="title"
      titleExtra={
        <View style={styles.actions}>
          <FollowDealer dealer={dealer} />
          <MessageDealer dealer={dealer} />
        </View>
      }
      action={
        <View style={styles.headerActions}>
          {listings.length > 0 ? (
            <FilterButton count={chosen} onPress={() => openFilters('shop', dealer.id)} />
          ) : null}
          <CloseButton onPress={close} />
        </View>
      }>
      <FlatList
        data={shown}
        keyExtractor={(card) => card.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <DealerPanel dealer={dealer} named={false} />
            {chosen > 0 ? (
              <Text style={styles.matched}>
                {shown.length} of {listings.length} watches
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Message
            text={
              listings.length === 0
                ? 'Nothing for sale right now.'
                : 'Nothing in this shop matches.'
            }
          />
        }
        renderItem={({ item }) => (
          <ListingRow
            card={item}
            onPress={() => {
              primeListing(item);
              open('listing/[listingId]', { listingId: item.id }, `/listing/${item.id}`);
            }}
          />
        )}
      />
    </Screen>
  );
}

const shopStyles = (theme: Theme) => ({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  header: {
    paddingBottom: space.lg,
    gap: space.md,
  },
  matched: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
});
