import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { formatPrice } from '@/lib/format';
import type { DeckCard } from '@/lib/models';
import { inset, radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function ListingRow({
  card,
  actionLabel,
  onAction,
  onPress,
  onLongPress,
}: {
  card: DeckCard;
  actionLabel?: string;
  onAction?: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const photo = card.photos[0]?.url;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={400} style={styles.row}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}

      <View style={styles.body}>
        <Text style={styles.brand} numberOfLines={1}>
          {card.brand}
        </Text>
        <Text style={styles.model} numberOfLines={1}>
          {card.model ?? 'Unknown model'}
        </Text>
        <Text style={styles.price}>{formatPrice(card)}</Text>
        {card.dealer ? (
          <Text style={styles.dealer} numberOfLines={1}>
            {card.dealer.name}
          </Text>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={space.md} style={styles.action}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.lg,
    paddingVertical: space.md,
  },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  body: {
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
    paddingTop: space.xs,
  },
  price: {
    ...type.caption,
    color: theme.color.text,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
  },
  action: {
    borderWidth: 1,
    borderColor: theme.color.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: inset.controlX,
    paddingVertical: space.sm,
  },
  actionLabel: {
    ...type.control,
    color: theme.color.text,
  },
});
