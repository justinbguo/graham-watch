import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Pressable as FramePressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { formatPrice, formatSpecs, formatTitle } from '@/lib/format';
import type { DeckCard, DeckPhoto } from '@/lib/models';
import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * One watch in the wide home grid. The photograph is the object — rounded,
 * square, on the page. The name, specs, price, and dealer sit under it on the
 * page colour, not inside a second surface. A marketplace scan, not a card
 * of cards. Tap opens the listing.
 */
export function ListingTile({
  card,
  onPress,
  selected = false,
}: {
  card: DeckCard;
  onPress?: () => void;
  /** The grid's keyboard cursor on the web. */
  selected?: boolean;
}) {
  const styles = useThemedStyles(tileStyles);

  return (
    <View style={styles.tile}>
      <TilePhotos photos={card.photos} selected={selected} onPress={onPress} />
      {/* Photograph and type open the listing separately so a sideways page
          on the frame is not also a tap on a parent pressable. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={formatTitle(card)}
        onPress={onPress}
        style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
        <Text style={styles.title} numberOfLines={2}>
          {formatTitle(card)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatSpecs(card)}
        </Text>
        <View style={styles.priceRow}>
          <Text style={card.sold_at ? styles.sold : styles.price} numberOfLines={1}>
            {card.sold_at ? 'Sold' : formatPrice(card)}
          </Text>
          {card.dealer ? (
            <Text style={styles.dealer} numberOfLines={1}>
              {card.dealer.name}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Square frame, photographs paged sideways. Bars at the bottom say which one
 * is showing — brass on the current, faint on the rest. A drag pages; a tap
 * opens the listing.
 */
function TilePhotos({
  photos,
  selected,
  onPress,
}: {
  photos: DeckPhoto[];
  selected: boolean;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(tileStyles);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [dragged, setDragged] = useState(false);

  useEffect(() => {
    const next = photos[page + 1] ?? photos[1];
    if (next) void Image.prefetch(next.url);
  }, [photos, page]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
  };

  if (photos.length === 0) {
    return (
      <View style={[styles.frame, selected && styles.frameSelected]} onLayout={onLayout}>
        <View style={styles.photoEmpty}>
          <Text style={styles.photoEmptyLabel}>No photograph</Text>
        </View>
      </View>
    );
  }

  if (photos.length === 1 || width === 0) {
    return (
      <FramePressable
        accessibilityRole="button"
        accessibilityLabel="Open listing"
        onPress={onPress}
        onLayout={onLayout}
        style={[styles.frame, selected && styles.frameSelected]}>
        <Image
          source={{ uri: photos[0].url }}
          style={styles.fill}
          contentFit="contain"
          accessible={false}
        />
      </FramePressable>
    );
  }

  return (
    <View style={[styles.frame, selected && styles.frameSelected]} onLayout={onLayout}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.fill}
        onScrollBeginDrag={() => setDragged(true)}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          setPage(Math.min(Math.max(next, 0), photos.length - 1));
        }}>
        {photos.map((photo) => (
          <FramePressable
            key={photo.id}
            accessible={false}
            importantForAccessibility="no"
            onPress={() => {
              if (dragged) {
                setDragged(false);
                return;
              }
              onPress?.();
            }}
            style={{ width, height: width }}>
            <Image source={{ uri: photo.url }} style={styles.fill} contentFit="contain" />
          </FramePressable>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.bars}>
        {photos.map((photo, index) => (
          <View key={photo.id} style={[styles.bar, index === page && styles.barOn]} />
        ))}
      </View>
    </View>
  );
}

const tileStyles = (theme: Theme) => ({
  tile: {
    flex: 1,
  },
  // The photograph is the only block. Type sits on the page under it.
  frame: {
    width: '100%' as const,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.surfaceSunken,
    // Transparent rather than absent: a border that appears only once selected
    // would move the frame by a pixel as the cursor lands on it.
    borderWidth: size.rule,
    borderColor: 'transparent',
  },
  frameSelected: {
    borderColor: theme.color.brass,
  },
  fill: {
    width: '100%' as const,
    height: '100%' as const,
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  photoEmptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  bars: {
    position: 'absolute' as const,
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    flexDirection: 'row' as const,
    gap: space.xs,
  },
  bar: {
    flex: 1,
    height: size.segment,
    backgroundColor: theme.color.textFaint,
  },
  barOn: {
    backgroundColor: theme.color.text,
  },
  copy: {
    paddingTop: space.sm,
    gap: space.xs,
  },
  title: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  meta: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  priceRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    justifyContent: 'space-between' as const,
    gap: space.sm,
    paddingTop: space.xs,
  },
  price: {
    ...type.priceSmall,
    color: theme.color.text,
    flexShrink: 0,
  },
  sold: {
    ...type.priceSmall,
    color: theme.color.textFaint,
    flexShrink: 0,
  },
  dealer: {
    ...type.control,
    color: theme.color.brass,
    flexShrink: 1,
    textAlign: 'right' as const,
  },
  pressed: {
    opacity: 0.72,
  },
});
