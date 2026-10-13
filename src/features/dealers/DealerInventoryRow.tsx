import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { DealerInventoryItem } from '@/data/dealers';
import { formatPrice } from '@/lib/format';
import { useIsWide } from '@/lib/layout';
import { HIT_TARGET, inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * One watch as its own shop sees it: the photograph a buyer sees, what it is
 * doing in the catalogue, and how many people wanted it.
 *
 * Removing is `status = 'hidden'`, never a delete. A deleted row takes its
 * photos, every save pointing at it, and the record that a buyer asked about it,
 * so the watch would vanish off someone's wishlist with no explanation.
 * Removal is reversible from the same button.
 */
export function DealerInventoryRow({
  item,
  busy,
  onEdit,
  onTogglePublished,
  onToggleSold,
}: {
  item: DealerInventoryItem;
  busy: boolean;
  onEdit: () => void;
  onTogglePublished: () => void;
  onToggleSold: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const isWide = useIsWide();
  const photo = item.photos[0]?.url;
  const removed = item.status === 'hidden';
  const state = item.sold_at ? 'Sold' : removed ? 'Removed' : 'Live';

  return (
    <View style={[styles.row, !isWide && styles.rowNarrow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.brand} ${item.model ?? ''}`.trim()}
        onPress={onEdit}
        style={styles.watch}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]} />
        )}

        <View style={styles.names}>
          <Text style={styles.brand} numberOfLines={1}>
            {item.brand}
          </Text>
          <Text style={styles.model} numberOfLines={1}>
            {item.model ?? 'Unknown model'}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {[item.reference, item.sold_at ? 'Sold' : formatPrice(item), state]
              .filter(Boolean)
              .join(' · ')}
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
          style={({ pressed }) => [
            styles.action,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}>
          <Text style={styles.actionLabel}>{item.sold_at ? 'Mark available' : 'Mark sold'}</Text>
        </Pressable>

        <IconAction icon="pencil-outline" label="Edit" disabled={busy} onPress={onEdit} />
        <IconAction
          icon={removed ? 'eye-outline' : 'eye-off-outline'}
          label={removed ? 'Restore' : 'Remove'}
          disabled={busy}
          onPress={onTogglePublished}
        />
      </View>
    </View>
  );
}

/** A glyph with the word in its accessibility label, where the row is short of width. */
function IconAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const theme = useTheme();

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
      <MaterialCommunityIcons name={icon} size={size.icon} color={theme.color.text} />
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
  },
  rowNarrow: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  watch: {
    flex: 2,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
  },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbEmpty: {
  },
  names: {
    flex: 1,
    gap: stack.tight,
  },
  brand: {
    ...type.eyebrow,
    color: theme.color.textMuted,
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
  },
  metric: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
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
