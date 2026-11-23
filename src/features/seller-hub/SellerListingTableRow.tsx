import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';

import { CheckMark } from '@/components/CheckRow';
import type { DealerInventoryItem, ListingPatch } from '@/data/dealers';
import { formatTitle } from '@/lib/format';
import { HIT_TARGET, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { ShopListingMenu } from '@/features/dealers/ShopListingMenu';

import {
  TABLE_COLUMN_LABELS,
  TABLE_COLUMNS,
  type TableDataColumnId,
} from './sellerListingTableLayout';

function priceDraft(cents: number | null) {
  if (cents == null) return '';
  return String(cents / 100);
}

function parsePriceDraft(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const dollars = Number(digits);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return dollars * 100;
}

export function SellerListingTableRow({
  item,
  selected,
  busy,
  onToggleSelect,
  onSave,
  onEdit,
  onTogglePublished,
  onToggleSold,
  onDelete,
}: {
  item: DealerInventoryItem;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onSave: (changes: ListingPatch) => void;
  onEdit: () => void;
  onTogglePublished: () => void;
  onToggleSold: () => void;
  onDelete?: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const theme = useTheme();
  const photo = item.photos[0]?.url;
  const hidden = item.status === 'hidden';
  const status = item.sold_at ? 'Sold' : hidden ? 'Hidden' : 'Live';

  const [priceText, setPriceText] = useState(priceDraft(item.price_cents));
  const [conditionText, setConditionText] = useState(item.condition ?? '');

  useEffect(() => {
    setPriceText(priceDraft(item.price_cents));
  }, [item.price_cents]);

  useEffect(() => {
    setConditionText(item.condition ?? '');
  }, [item.condition]);

  const commitPrice = () => {
    const next = parsePriceDraft(priceText);
    const prev = item.price_cents;
    if (next === prev || (next == null && prev == null)) return;
    onSave({ price_cents: next });
  };

  const commitCondition = () => {
    const next = conditionText.trim();
    const prev = item.condition?.trim() ?? '';
    if (next === prev) return;
    onSave({ condition: next || null });
  };

  const openListing = () => {
    const url = item.source_url?.trim();
    if (url) void Linking.openURL(url);
  };

  return (
    <View style={[styles.row, hidden && styles.rowMuted, selected && styles.rowSelected]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`Select ${formatTitle(item)}`}
        onPress={onToggleSelect}
        style={styles.checkHit}>
        <CheckMark selected={selected} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${formatTitle(item)}`}
        onPress={onEdit}
        style={[styles.cell, styles.product]}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" accessible={false} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}
        <View style={styles.productCopy}>
          <Text style={styles.productTitle} numberOfLines={2}>
            {formatTitle(item)}
          </Text>
          {item.reference ? (
            <Text style={styles.productSub} numberOfLines={1}>
              {item.reference}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={[styles.cell, styles.brand]}>
        <Text style={styles.cellText} numberOfLines={2}>
          {item.brand}
        </Text>
      </View>

      <View style={[styles.cell, styles.price]}>
        {item.sold_at ? (
          <Text style={styles.cellMuted}>Sold</Text>
        ) : (
          <TextInput
            accessibilityLabel="Price in dollars"
            value={priceText}
            onChangeText={setPriceText}
            onBlur={commitPrice}
            onSubmitEditing={commitPrice}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={theme.color.textFaint}
            style={styles.input}
          />
        )}
      </View>

      <View style={[styles.cell, styles.condition]}>
        <TextInput
          accessibilityLabel="Condition"
          value={conditionText}
          onChangeText={setConditionText}
          onBlur={commitCondition}
          onSubmitEditing={commitCondition}
          placeholder="—"
          placeholderTextColor={theme.color.textFaint}
          style={styles.input}
        />
      </View>

      <View style={[styles.cell, styles.status]}>
        <Text style={styles.cellText}>{status}</Text>
      </View>

      <View style={[styles.cell, styles.actions]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open on your site"
          disabled={!item.source_url}
          onPress={openListing}
          style={({ pressed }) => [styles.iconHit, pressed && styles.pressed]}>
          <MaterialCommunityIcons
            name="link-variant"
            size={size.icon}
            color={item.source_url ? theme.color.text : theme.color.textFaint}
          />
        </Pressable>
        <ShopListingMenu
          sold={Boolean(item.sold_at)}
          hidden={hidden}
          disabled={busy}
          onMarkSold={onToggleSold}
          onEdit={onEdit}
          onToggleVisibility={onTogglePublished}
          onDelete={onDelete}
        />
      </View>
    </View>
  );
}

export function SellerListingTableHeader({
  allSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  onToggleAll: () => void;
}) {
  const styles = useThemedStyles(rowStyles);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allSelected }}
        accessibilityLabel="Select all listings"
        onPress={onToggleAll}
        style={styles.checkHit}>
        <CheckMark selected={allSelected} />
      </Pressable>
      {TABLE_COLUMN_LABELS.map((column) => (
        <View key={column.id} style={[styles.cell, dataColumnStyle(styles, column.id)]}>
          <Text style={styles.headerLabel}>{column.label}</Text>
        </View>
      ))}
    </View>
  );
}

const rowStyles = (theme: Theme) => ({
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    backgroundColor: theme.color.surface,
    gap: space.sm,
  },
  headerLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    minHeight: HIT_TARGET + space.md,
  },
  rowMuted: {
    opacity: 0.72,
  },
  rowSelected: {
    backgroundColor: theme.color.fill,
  },
  checkHit: {
    width: TABLE_COLUMNS.check,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cell: {
    minWidth: 0,
  },
  product: {
    flex: TABLE_COLUMNS.product,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  brand: {
    flex: TABLE_COLUMNS.brand,
  },
  price: {
    flex: TABLE_COLUMNS.price,
    gap: space.xs,
  },
  condition: {
    flex: TABLE_COLUMNS.condition,
  },
  status: {
    flex: TABLE_COLUMNS.status,
  },
  actions: {
    width: TABLE_COLUMNS.actions,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: space.xs,
  },
  thumb: {
    width: 44,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    gap: space.xs / 2,
  },
  productTitle: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  productSub: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  cellText: {
    ...type.body,
    color: theme.color.text,
  },
  cellMuted: {
    ...type.body,
    color: theme.color.textMuted,
  },
  input: {
    ...type.body,
    color: theme.color.text,
    padding: 0,
    margin: 0,
    minHeight: type.body.lineHeight,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  iconHit: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});

function dataColumnStyle(styles: ReturnType<typeof rowStyles>, id: TableDataColumnId): ViewStyle {
  switch (id) {
    case 'product':
      return styles.product;
    case 'brand':
      return styles.brand;
    case 'price':
      return styles.price;
    case 'condition':
      return styles.condition;
    case 'status':
      return styles.status;
    case 'actions':
      return styles.actions;
  }
}
