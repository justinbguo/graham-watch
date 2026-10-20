import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable as FramePressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { Avatar } from '@/components/Avatar';
import { dealerPicture } from '@/features/dealers/picture';
import { formatPrice, formatSpecs, formatTitle } from '@/lib/format';
import type { DeckCard, DeckPhoto } from '@/lib/models';
import { photoScrollPage } from '@/lib/photoPager';
import { layout, radius, size, space, type, type Theme } from '@/lib/theme';
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
  photoShape = 'square',
}: {
  card: DeckCard;
  onPress?: () => void;
  /** The grid's keyboard cursor on the web. */
  selected?: boolean;
  /** Desktop web grid: same photograph proportion as the swipe card. */
  photoShape?: 'square' | 'swipe';
}) {
  const styles = useThemedStyles(tileStyles);

  return (
    <View style={styles.tile}>
      <TilePhotos
        photos={card.photos}
        selected={selected}
        photoShape={photoShape}
        onPress={onPress}
      />
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
            <View style={styles.dealerRow}>
              <Avatar
                url={card.dealer.logo_url}
                px={size.iconSmall}
                fit="contain"
                fallback={dealerPicture}
              />
              <Text style={styles.dealer} numberOfLines={1}>
                {card.dealer.name}
              </Text>
            </View>
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
  photoShape,
  onPress,
}: {
  photos: DeckPhoto[];
  selected: boolean;
  photoShape: 'square' | 'swipe';
  onPress?: () => void;
}) {
  const styles = useThemedStyles(tileStyles);
  const frameStyle = photoShape === 'swipe' ? styles.frameSwipe : styles.frame;
  const [width, setWidth] = useState(0);
  const frameHeight =
    width > 0 && photoShape === 'swipe' ? width / layout.deckGridPhotoAspect : width;
  const [page, setPage] = useState(0);
  const [dragged, setDragged] = useState(false);

  useEffect(() => {
    const next = photos[page + 1] ?? photos[1];
    if (next) void Image.prefetch(next.url);
  }, [photos, page]);

  const syncPage = useCallback(
    (offsetX: number) => {
      setPage((current) => {
        const next = photoScrollPage(offsetX, width, photos.length);
        return current === next ? current : next;
      });
    },
    [photos.length, width],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
  };

  if (photos.length === 0) {
    return (
      <View style={frameStyle} onLayout={onLayout}>
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
        style={frameStyle}>
        <Image
          source={{ uri: photos[0].url }}
          contentFit={photoShape === 'swipe' ? 'cover' : 'contain'}
          style={styles.fill}
          accessible={false}
        />
      </FramePressable>
    );
  }

  return (
    <View style={frameStyle} onLayout={onLayout}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.fill}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setDragged(true)}
        onScroll={(event) => syncPage(event.nativeEvent.contentOffset.x)}
        onMomentumScrollEnd={(event) => {
          syncPage(event.nativeEvent.contentOffset.x);
          setDragged(false);
        }}
        onScrollEndDrag={(event) => {
          syncPage(event.nativeEvent.contentOffset.x);
          const vx = event.nativeEvent.velocity?.x ?? 0;
          if (vx === 0) setDragged(false);
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
            style={{ width, height: photoShape === 'swipe' ? frameHeight : width }}>
            <Image
              source={{ uri: photo.url }}
              style={styles.fill}
              contentFit={photoShape === 'swipe' ? 'cover' : 'contain'}
            />
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
    backgroundColor: theme.color.photoMat,
    borderWidth: 0,
  },
  frameSwipe: {
    width: '100%' as const,
    aspectRatio: layout.deckGridPhotoAspect,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.background,
    borderWidth: 0,
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
    flexWrap: 'nowrap' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingTop: space.xs,
    width: '100%' as const,
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
  dealerRow: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: space.xs,
    minWidth: 0,
  },
  dealer: {
    ...type.control,
    color: theme.color.text,
    flexShrink: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.72,
  },
});
