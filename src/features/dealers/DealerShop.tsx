import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FilterMenu } from '@/features/filters/FilterMenu';
import { ListingRow } from '@/components/ListingRow';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { dealerPicture } from '@/features/dealers/picture';
import { useDealerShop } from '@/data/dealers';
import { usePrimeListing } from '@/data/listings';
import { matchesListing } from '@/features/filters/match';
import { useFilters } from '@/features/filters/provider';
import { activeCount } from '@/features/filters/types';
import { useOpenStack } from '@/lib/openStack';
import { inset, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { DealerPanel } from './DealerPanel';

export function DealerShop({ dealerId }: { dealerId: string }) {
  const styles = useThemedStyles(shopStyles);
  const open = useOpenStack();
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
      titleControl={
        <View style={styles.shopTitle}>
          <Avatar
            url={dealer.logo_url ?? null}
            px={size.icon}
            fit="contain"
            fallback={dealerPicture}
          />
          <Text style={styles.shopName} numberOfLines={2}>
            {dealer.name}
          </Text>
        </View>
      }
      action={<CloseButton onPress={close} />}>
      <FlatList
        data={shown}
        keyExtractor={(card) => card.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <DealerPanel dealer={dealer} follow named={false} />
            <View style={styles.inventoryHead}>
              <Text style={styles.inventoryTitle}>Inventory</Text>
              {listings.length > 0 ? (
                <FilterMenu surface="shop" dealerId={dealer.id} count={chosen} />
              ) : null}
            </View>
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
  shopTitle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flex: 1,
    minWidth: 0,
  },
  shopName: {
    ...type.title,
    color: theme.color.text,
    flexShrink: 1,
    minWidth: 0,
  },
  inventoryHead: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  inventoryTitle: {
    ...type.title,
    color: theme.color.text,
  },
  matched: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
