import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { formatPrice, formatTitle } from '@/lib/format';
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
        <View style={styles.thumb} />
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {formatTitle(card)}
        </Text>
        {/* Sold replaces the price rather than sitting beside it. A number next
            to "Sold" reads as what it is going for, not what it went for. */}
        <Text style={card.sold_at ? styles.sold : styles.price}>
          {card.sold_at ? 'Sold' : formatPrice(card)}
        </Text>
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
  body: {
    flex: 1,
    gap: stack.tight,
  },
  title: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  price: {
    ...type.caption,
    color: theme.color.text,
  },
  sold: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  dealer: {
    ...type.caption,
    color: theme.color.brass,
  },
  action: {
    backgroundColor: theme.color.fill,
    borderRadius: radius.sm,
    paddingHorizontal: inset.compactX,
    paddingVertical: inset.compactY,
  },
  actionLabel: {
    ...type.control,
    color: theme.color.text,
  },
});
