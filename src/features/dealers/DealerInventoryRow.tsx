import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { Platform, Pressable, Text, View } from 'react-native';

import type { DealerInventoryItem } from '@/data/dealers';
import { formatPrice, formatTitle } from '@/lib/format';
import { useIsWide } from '@/lib/layout';
import { ShopListingMenu } from './ShopListingMenu';
import { HIT_TARGET, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const SHOP_PHOTO_WIDTH = 120;

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * One watch as its own shop sees it: the photograph a buyer sees, what it is
 * doing in the catalogue, and how many people wanted it.
 */
export function DealerInventoryRow({
  item,
  busy,
  layout = 'profile',
  onEdit,
  onTogglePublished,
  onToggleSold,
  onDelete,
}: {
  item: DealerInventoryItem;
  busy: boolean;
  /** Your Shop listings: tighter row on a flat background. */
  layout?: 'profile' | 'shop';
  onEdit: () => void;
  onTogglePublished: () => void;
  onToggleSold: () => void;
  onDelete?: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const isWide = useIsWide();
  const hubRow = Platform.OS === 'web' && isWide;
  const shop = layout === 'shop';
  const photo = item.photos[0]?.url;
  const hidden = item.status === 'hidden';
  const state = item.sold_at ? 'Sold' : hidden ? 'Hidden' : 'Live';
  const subtitle = [item.reference, item.sold_at ? null : formatPrice(item), state]
    .filter(Boolean)
    .join(' · ');

  if (shop) {
    return (
      <View style={[styles.rowShop, hidden && styles.rowHidden]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${formatTitle(item)}`}
          onPress={onEdit}
          style={styles.shopPhotoHit}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.thumbShop} contentFit="cover" />
          ) : (
            <View style={[styles.thumbShop, styles.thumbEmpty]} />
          )}
        </Pressable>

        <View style={styles.shopBody}>
          <View style={styles.shopTitleRow}>
            <View style={styles.shopTitleWrap}>
              <Text style={styles.shopTitle}>{formatTitle(item)}</Text>
            </View>
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
          {subtitle ? (
            <Text style={styles.detail} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <View style={styles.shopMetrics}>
            <MetricStat label="Saves" value={item.saves} />
            <MetricStat label="Inquiries" value={item.inquiries} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.row,
        !hubRow && !isWide && styles.rowNarrow,
        hidden && styles.rowHidden,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${formatTitle(item)}`}
        onPress={onEdit}
        style={styles.watch}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}

        <View style={styles.names}>
          <Text style={styles.model} numberOfLines={hubRow ? 2 : 1}>
            {formatTitle(item)}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Pressable>

      <View style={styles.metrics}>
        <Text style={styles.metric}>{item.saves} saves</Text>
        <Text style={styles.metric}>{item.inquiries} inquiries</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onToggleSold}
          style={({ pressed }) => [styles.action, pressed && styles.pressed, busy && styles.disabled]}>
          <Text style={styles.actionLabel}>{item.sold_at ? 'Mark available' : 'Mark sold'}</Text>
        </Pressable>

        <IconAction icon="pencil-outline" label="Edit" disabled={busy} onPress={onEdit} />
        <IconAction
          icon={hidden ? 'eye-outline' : 'eye-off-outline'}
          label={hidden ? 'Show listing' : 'Hide listing'}
          disabled={busy}
          onPress={onTogglePublished}
        />
        {onDelete ? (
          <IconAction
            icon="trash-can-outline"
            label="Delete listing"
            disabled={busy}
            danger
            onPress={onDelete}
          />
        ) : null}
      </View>
    </View>
  );
}

function MetricStat({ label, value }: { label: string; value: number }) {
  const styles = useThemedStyles(rowStyles);
  return (
    <View style={styles.metricBlock}>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function IconAction({
  icon,
  label,
  disabled,
  danger = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const theme = useTheme();
  const color = danger ? theme.color.danger : theme.color.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <MaterialCommunityIcons name={icon} size={size.icon} color={color} />
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
    minWidth: 0,
  },
  rowShop: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    alignSelf: 'stretch' as const,
    width: '100%' as const,
    minWidth: 0,
    gap: space.md,
    paddingVertical: space.sm,
  },
  rowHidden: {
    opacity: 0.52,
  },
  rowNarrow: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  shopPhotoHit: {
    flexShrink: 0,
  },
  shopBody: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
    paddingTop: space.xs,
  },
  shopTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 0,
    width: '100%' as const,
    minWidth: 0,
  },
  shopTitleWrap: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexShrink: 1,
  },
  shopTitle: {
    ...type.bodyStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
  shopMetrics: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.lg,
    paddingTop: space.xs,
  },
  metricBlock: {
    minWidth: 72,
    alignItems: 'flex-start' as const,
    gap: 2,
  },
  metricValue: {
    ...type.title,
    fontSize: 20,
    lineHeight: 24,
    color: theme.color.text,
  },
  metricLabel: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  watch: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minWidth: 0,
  },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbShop: {
    width: SHOP_PHOTO_WIDTH,
    aspectRatio: 5 / 7,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbEmpty: {},
  names: {
    flex: 1,
    gap: stack.tight,
    minWidth: 0,
  },
  model: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  metrics: {
    flexDirection: 'row' as const,
    gap: space.md,
    flexShrink: 0,
  },
  metric: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 0,
  },
  action: {
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.fill,
    borderRadius: radius.full,
    paddingHorizontal: inset.compactX,
    paddingVertical: inset.compactY,
  },
  iconAction: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  actionLabel: {
    ...type.control,
    color: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
});
