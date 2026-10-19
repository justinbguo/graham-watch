import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { SearchField } from '@/components/SearchBar';
import { Heading, Message, Spinner } from '@/components/ui';
import { DealerInventoryRow } from '@/features/dealers/DealerInventoryRow';
import { useDealerWorkspace } from '@/features/dealers/workspace';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import {
  filterDealerInventory,
  type ListingInventoryFilter,
} from './listingInventoryFilter';

const FILTERS: { id: ListingInventoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'sold', label: 'Sold' },
];

/** Inventory controls for the hub Listings section. */
export function SellerListingsPanel({
  active = true,
}: {
  /** Hub tab is visible — refetch saves and inquiry counts. */
  active?: boolean;
}) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();
  const open = useOpenStack();
  const shop = useDealerWorkspace();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListingInventoryFilter>('all');

  const shown = useMemo(
    () => filterDealerInventory(shop.inventory, statusFilter, query),
    [shop.inventory, statusFilter, query],
  );

  useEffect(() => {
    if (active && shop.shop) void shop.reload();
  }, [active, shop.shop, shop.reload]);

  if (shop.isLoading) return <Spinner />;
  if (!shop.shop) {
    return <Message text="Claim a shop on Profile to manage listings here." />;
  }

  const { inventory, togglePublished, toggleSold, deleteListing, isSaving, reload, isReloading } =
    shop;
  const dealer = shop.shop!;

  const openCatalogImport = () => {
    const sourceUrl = dealer.website?.trim();
    if (!sourceUrl) {
      Alert.alert(
        'Catalogue URL needed',
        'On Profile, under your shop, enter the page where your watches are listed. We read that page to find new products.',
      );
      return;
    }
    open(
      'import-inventory',
      { dealerId: dealer.id, sourceUrl },
      { pathname: '/import-inventory', params: { dealerId: dealer.id, sourceUrl } },
    );
  };

  const confirmDelete = (item: (typeof inventory)[number]) => {
    const saves = item.saves;
    const inquiries = item.inquiries;
    const cost =
      saves || inquiries
        ? `\n\nThis removes ${saves} save${saves === 1 ? '' : 's'} and ${inquiries} inquir${inquiries === 1 ? 'y' : 'ies'} permanently.`
        : '';

    Alert.alert(
      'Delete this listing?',
      `${item.brand} ${item.model ?? ''} will leave your catalogue and the buyer deck.${cost}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteListing(item),
        },
      ],
    );
  };

  const emptyCopy =
    inventory.length === 0
      ? {
          title: 'No listings yet',
          body: 'Refresh your catalogue from Profile, or edit watches after import.',
        }
      : {
          title: 'No matches',
          body: 'Try another filter or search term.',
        };

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <SearchField
          compact
          placeholder="Search"
          accessibilityLabel="Search listings"
          value={query}
          onChangeText={setQuery}
          style={styles.searchSlot}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh listings"
          disabled={isReloading}
          onPress={() => reload()}
          style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}>
          {isReloading ? (
            <ActivityIndicator size="small" color={theme.color.text} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={size.icon} color={theme.color.text} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add listings from your website"
          onPress={openCatalogImport}
          style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="plus" size={size.icon} color={theme.color.text} />
        </Pressable>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((chip) => {
          const selected = statusFilter === chip.id;
          return (
            <Pressable
              key={chip.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setStatusFilter(chip.id)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={shown.length === 0 ? styles.empty : styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListEmptyComponent={
          <View style={styles.emptyCopy}>
            <Heading>{emptyCopy.title}</Heading>
            <Message text={emptyCopy.body} />
          </View>
        }
        renderItem={({ item }) => (
          <DealerInventoryRow
            item={item}
            layout="shop"
            busy={isSaving}
            onEdit={() =>
              open(
                'edit-listing/[listingId]',
                { listingId: item.id },
                `/edit-listing/${item.id}`,
              )
            }
            onTogglePublished={() => togglePublished(item)}
            onToggleSold={() => toggleSold(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
      />
    </View>
  );
}

const panelStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    gap: space.sm,
  },
  toolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  searchSlot: {
    flex: 1,
    minWidth: 0,
  },
  iconHit: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  filters: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.color.fill,
  },
  chipSelected: {
    backgroundColor: theme.color.text,
  },
  chipLabel: {
    ...type.control,
    color: theme.color.text,
  },
  chipLabelSelected: {
    color: theme.color.background,
  },
  pressed: {
    opacity: 0.72,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: space.xxxl,
  },
  empty: {
    flexGrow: 1,
  },
  emptyCopy: {
    gap: stack.related,
    paddingTop: space.xl,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.border,
  },
});
