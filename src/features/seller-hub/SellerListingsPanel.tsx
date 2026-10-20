import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { SearchField } from '@/components/SearchBar';
import { Heading, Message, Spinner } from '@/components/ui';
import { useDealerShop, useUpdateDealerListing } from '@/data/dealers';
import { useDealerWorkspace } from '@/features/dealers/workspace';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { CatalogueImportSheet } from './CatalogueImportSheet';
import {
  filterDealerInventory,
  type ListingInventoryFilter,
} from './listingInventoryFilter';
import { SellerListingTableHeader, SellerListingTableRow } from './SellerListingTableRow';

const FILTERS: { id: ListingInventoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'sold', label: 'Sold' },
];

/** Deal tab Listings: searchable table with multi-select and inline edits. */
export function SellerListingsPanel({
  active = true,
}: {
  active?: boolean;
}) {
  const styles = useThemedStyles(panelStyles);
  const theme = useTheme();
  const open = useOpenStack();
  const shop = useDealerWorkspace();
  const dealerProfile = useDealerShop(shop.shop?.id ?? '');
  const updateListing = useUpdateDealerListing(shop.shop?.id ?? null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListingInventoryFilter>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const shown = useMemo(
    () => filterDealerInventory(shop.inventory, statusFilter, query),
    [shop.inventory, statusFilter, query],
  );

  const selectedItems = useMemo(
    () => shop.inventory.filter((item) => selected.has(item.id)),
    [shop.inventory, selected],
  );

  useEffect(() => {
    if (active && shop.shop) void shop.reload();
  }, [active, shop.shop, shop.reload]);

  if (shop.isLoading) return <Spinner />;
  if (!shop.shop) {
    return <Message text="Claim a shop on Profile to manage listings here." />;
  }

  const { inventory, togglePublished, toggleSold, deleteListing, isSaving } = shop;
  const dealer = shop.shop;

  const allSelected = shown.length > 0 && shown.every((item) => selected.has(item.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(shown.map((item) => item.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmDelete = (items: typeof inventory) => {
    const count = items.length;
    Alert.alert(
      count === 1 ? 'Delete this listing?' : `Delete ${count} listings?`,
      'They leave your catalogue and the buyer deck.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            for (const item of items) deleteListing(item);
            setSelected(new Set());
          },
        },
      ],
    );
  };

  const bulkHide = () => {
    for (const item of selectedItems) {
      if (item.status !== 'hidden' && !item.sold_at) togglePublished(item);
    }
    setSelected(new Set());
  };

  const bulkShow = () => {
    for (const item of selectedItems) {
      if (item.status === 'hidden' && !item.sold_at) togglePublished(item);
    }
    setSelected(new Set());
  };

  const bulkSold = () => {
    for (const item of selectedItems) {
      if (!item.sold_at) toggleSold(item);
    }
    setSelected(new Set());
  };

  const emptyCopy =
    inventory.length === 0
      ? {
          title: 'No listings yet',
          body: 'Use Import next to search to refresh from your site.',
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
          accessibilityLabel="Import from your website"
          onPress={() => setImportOpen(true)}
          style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="cloud-download-outline" size={size.icon} color={theme.color.text} />
        </Pressable>
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((chip) => {
          const on = statusFilter === chip.id;
          return (
            <Pressable
              key={chip.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setStatusFilter(chip.id)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {selectedItems.length > 0 ? (
        <View style={styles.bulk}>
          <Text style={styles.bulkCount}>{selectedItems.length} selected</Text>
          <Pressable accessibilityRole="button" onPress={bulkHide} style={styles.bulkAction}>
            <Text style={styles.bulkActionLabel}>Hide</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={bulkShow} style={styles.bulkAction}>
            <Text style={styles.bulkActionLabel}>Show</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={bulkSold} style={styles.bulkAction}>
            <Text style={styles.bulkActionLabel}>Mark sold</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => confirmDelete(selectedItems)}
            style={styles.bulkAction}>
            <Text style={styles.bulkActionLabel}>Delete</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.table}>
        <SellerListingTableHeader allSelected={allSelected} onToggleAll={toggleAll} />
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={shown.length === 0 ? styles.empty : styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyCopy}>
              <Heading>{emptyCopy.title}</Heading>
              <Message text={emptyCopy.body} />
            </View>
          }
          renderItem={({ item }) => (
            <SellerListingTableRow
              item={item}
              selected={selected.has(item.id)}
              busy={isSaving || updateListing.isPending}
              onToggleSelect={() => toggleOne(item.id)}
              onSave={(changes) => updateListing.mutate({ listingId: item.id, changes })}
              onEdit={() =>
                open('edit-listing/[listingId]', { listingId: item.id }, `/edit-listing/${item.id}`)
              }
              onTogglePublished={() => togglePublished(item)}
              onToggleSold={() => toggleSold(item)}
              onDelete={() => confirmDelete([item])}
            />
          )}
        />
      </View>

      <CatalogueImportSheet
        visible={importOpen}
        dealerId={dealer.id}
        website={dealerProfile.data?.dealer?.website ?? dealer.website}
        onClose={() => setImportOpen(false)}
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
  chipOn: {
    backgroundColor: theme.color.text,
  },
  chipLabel: {
    ...type.control,
    color: theme.color.text,
  },
  chipLabelOn: {
    color: theme.color.background,
  },
  pressed: {
    opacity: 0.72,
  },
  bulk: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
  },
  bulkCount: {
    ...type.labelStrong,
    color: theme.color.text,
    marginRight: space.sm,
  },
  bulkAction: {
    paddingVertical: space.xs,
  },
  bulkActionLabel: {
    ...type.control,
    color: theme.color.text,
  },
  table: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.background,
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
    padding: space.xl,
  },
});
