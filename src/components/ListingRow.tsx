import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeckCard } from '@/lib/database.types';
import { theme } from '@/lib/theme';

export function ListingRow({
  card,
  actionLabel,
  onAction,
  onLongPress,
}: {
  card: DeckCard;
  actionLabel?: string;
  onAction?: () => void;
  onLongPress?: () => void;
}) {
  const photo = card.photos[0]?.url;
  const price =
    card.price_cents == null
      ? 'Price on request'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: card.currency,
          maximumFractionDigits: 0,
        }).format(card.price_cents / 100);

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={400} style={styles.row}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.thumb} />
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
        <Text style={styles.price}>{price}</Text>
        {card.dealer ? (
          <Text style={styles.dealer} numberOfLines={1}>
            {card.dealer.name}
          </Text>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    paddingVertical: theme.space(1.25),
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: theme.radius / 1.5,
    backgroundColor: theme.color.bg,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  brand: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.color.muted,
  },
  model: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.color.text,
  },
  price: {
    fontSize: 14,
    color: theme.color.text,
  },
  dealer: {
    fontSize: 13,
    color: theme.color.muted,
  },
  action: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.color.text,
  },
});
