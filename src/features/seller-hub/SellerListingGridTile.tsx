import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { DealerInventoryItem } from '@/data/dealers';
import { ShopListingMenu } from '@/features/dealers/ShopListingMenu';
import { formatPrice, formatTitle } from '@/lib/format';
import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const TITLE_LINES = 2;

/**
 * One listing in the Deal hub inventory grid: fixed photo ratio, cropped type.
 */
export function SellerListingGridTile({
  item,
  busy,
  onEdit,
  onTogglePublished,
  onToggleSold,
  onDelete,
}: {
  item: DealerInventoryItem;
  busy: boolean;
  onEdit: () => void;
  onTogglePublished: () => void;
  onToggleSold: () => void;
  onDelete?: () => void;
}) {
  const styles = useThemedStyles(tileStyles);
  const photo = item.photos[0]?.url;
  const hidden = item.status === 'hidden';
  const state = item.sold_at ? 'Sold' : hidden ? 'Hidden' : 'Live';
  const meta = [item.reference, item.sold_at ? null : formatPrice(item), state].filter(Boolean).join(' · ');

  return (
    <View style={[styles.tile, hidden && styles.tileHidden]}>
      <View style={styles.photoFrame}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${formatTitle(item)}`}
          onPress={onEdit}
          style={styles.photoHit}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]} />
          )}
        </Pressable>
        <View style={styles.menu}>
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={formatTitle(item)}
        onPress={onEdit}
        style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
        <Text style={styles.title} numberOfLines={TITLE_LINES}>
          {formatTitle(item)}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Text style={styles.stats} numberOfLines={1}>
          {item.saves} saves · {item.inquiries} inquir{item.inquiries === 1 ? 'y' : 'ies'}
        </Text>
      </Pressable>
    </View>
  );
}

const tileStyles = (theme: Theme) => {
  const titleLine = type.bodyStrong.lineHeight;
  return {
    tile: {
      flex: 1,
      minWidth: 0,
      gap: space.sm,
    },
    tileHidden: {
      opacity: 0.52,
    },
    photoFrame: {
      position: 'relative' as const,
      width: '100%' as const,
    },
    photoHit: {
      width: '100%' as const,
    },
    photo: {
      width: '100%' as const,
      aspectRatio: 5 / 7,
      borderRadius: radius.md,
      backgroundColor: theme.color.surfaceSunken,
    },
    photoEmpty: {},
    menu: {
      position: 'absolute' as const,
      top: space.xs,
      right: space.xs,
    },
    copy: {
      gap: space.xs,
      minWidth: 0,
    },
    title: {
      ...type.bodyStrong,
      color: theme.color.text,
      minHeight: titleLine * TITLE_LINES,
    },
    meta: {
      ...type.caption,
      color: theme.color.textMuted,
    },
    stats: {
      ...type.caption,
      color: theme.color.textMuted,
    },
    pressed: {
      opacity: 0.88,
    },
  };
};
