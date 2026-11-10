import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable as FramePressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { GridPhotoStrip } from '@/components/GridPhotoStrip';
import { Pressable } from 'react-native-gesture-handler';

import { formatPrice, formatSpecs, formatTitle } from '@/lib/format';
import type { DeckCard, DeckPhoto } from '@/lib/models';
import { photoScrollPage } from '@/lib/photoPager';
import { fieldOutline, layout, listingTile, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * One watch in the wide home grid. The photograph is the object — rounded,
 * square, on the page. The shop name sits on the photograph. The title, specs,
 * and price sit under it on the page colour. Tap opens the listing.
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
  const specs = formatSpecs(card);

  return (
    <View style={styles.tile}>
      <TilePhotos
        photos={card.photos}
        dealerName={card.dealer?.name}
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
        <View style={styles.band}>
          <View style={styles.titleSlot}>
            <Text style={styles.title} numberOfLines={listingTile.titleLines}>
              {formatTitle(card)}
            </Text>
          </View>
          <View style={card.sold_at ? styles.soldBadge : styles.priceBadge}>
            <Text style={card.sold_at ? styles.sold : styles.price} numberOfLines={1}>
              {card.sold_at ? 'Sold' : formatPrice(card)}
            </Text>
          </View>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {specs}
        </Text>
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
  dealerName,
  selected,
  photoShape,
  onPress,
}: {
  photos: DeckPhoto[];
  dealerName?: string;
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

  const shop = dealerName ? (
    <View
      pointerEvents="none"
      style={[styles.shopLabel, photos.length > 1 && styles.shopLabelAboveBars]}>
      <View style={styles.shopPill}>
        <Text style={styles.shopLabelText} numberOfLines={1}>
          {dealerName}
        </Text>
      </View>
    </View>
  ) : null;

  if (photos.length === 0) {
    return (
      <View style={frameStyle} onLayout={onLayout}>
        <View style={styles.photoEmpty}>
          <Text style={styles.photoEmptyLabel}>No photograph</Text>
        </View>
        {shop}
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
        {shop}
      </FramePressable>
    );
  }

  const contentFit = photoShape === 'swipe' ? 'cover' : 'contain';

  if (Platform.OS === 'web') {
    return (
      <View style={frameStyle} onLayout={onLayout}>
        <GridPhotoStrip
          photos={photos}
          width={width}
          height={frameHeight}
          contentFit={contentFit}
          page={page}
          onPageChange={setPage}
          onPress={onPress}
        />
        {shop}
      </View>
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
      {shop}
    </View>
  );
}

const tileStyles = (theme: Theme) => {
  const priceFrame = {
    borderWidth: fieldOutline,
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
    justifyContent: 'center' as const,
    flexShrink: 0,
    height: listingTile.titleBand,
    maxWidth: `${listingTile.priceMaxShare * 100}%` as const,
  };
  return {
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
  band: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.sm,
  },
  titleSlot: {
    flex: 1,
    minWidth: 0,
    height: listingTile.titleBand,
    overflow: 'hidden' as const,
  },
  title: {
    ...listingTile.title,
    color: theme.color.text,
  },
    meta: {
      ...type.caption,
      color: theme.color.textMuted,
      minHeight: type.caption.lineHeight,
    },
    priceBadge: {
      ...priceFrame,
      borderColor: theme.color.money,
    },
    soldBadge: {
      ...priceFrame,
      borderColor: theme.color.border,
    },
    price: {
      ...type.priceSmall,
      color: theme.color.money,
      flexShrink: 0,
    },
    sold: {
      ...type.priceSmall,
      color: theme.color.textFaint,
      flexShrink: 0,
    },
    shopLabel: {
      position: 'absolute' as const,
      left: space.sm,
      right: space.sm,
      bottom: space.sm,
      alignItems: 'flex-start' as const,
    },
    shopLabelAboveBars: {
      bottom: space.md,
    },
    shopPill: {
      maxWidth: '100%' as const,
      backgroundColor: theme.color.glassFill,
      borderRadius: radius.lg,
      paddingHorizontal: space.sm,
      paddingVertical: space.xs,
    },
    shopLabelText: {
      ...type.caption,
      color: theme.color.onOverlay,
    },
    pressed: {
      opacity: 0.72,
    },
  };
};
