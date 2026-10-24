import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable as FramePressable, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { InquireMark } from '@/components/InquireMark';
import { ListingSummary } from '@/components/ListingSummary';
import { useSwipeGuard } from '@/components/SwipeToRemove';
import { formatTitle } from '@/lib/format';
import { photoScrollPage } from '@/lib/photoPager';
import type { DeckCard, DeckPhoto } from '@/lib/models';
import { layout, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * One watch in a list: the photograph at a size worth looking at, the name,
 * its specs, the price, and the dealer beside it. The deck's grid, the wishlist,
 * and a dealer's shop all use this, so a watch in a list is the same object
 * wherever the list is. Search is a wall of photographs instead.
 */
export function ListingRow({
  card,
  onMessage,
  messagePending = false,
  inConversation = false,
  photoWidth,
  onPress,
  selected = false,
  scan = false,
  compact = false,
  note,
  notedAt,
  prompt = false,
  attention = false,
}: {
  card: DeckCard;
  /**
   * Under the price, on the wishlist. Opens the thread with this shop about this
   * watch. Absent on a sold watch, and wherever a row is only for looking.
   */
  onMessage?: () => void;
  messagePending?: boolean;
  /** A message already names this watch. The button opens that thread. */
  inConversation?: boolean;
  /** Set when a list wants a frame other than `gridPhoto`. The home grid passes `gridScan` through `scan`. */
  photoWidth?: number;
  onPress?: () => void;
  /** The grid's keyboard cursor on the web. A phone has no such thing. */
  selected?: boolean;
  /**
   * The home grid. The photograph pages, and the row is shorter than search
   * and a shop.
   */
  scan?: boolean;
  /**
   * The wishlist. No card behind the row, a smaller rounded photograph
   * centred on the type, and no spec line. The list draws the dividers.
   */
  compact?: boolean;
  /** Between the name and the price on a compact row. */
  note?: string;
  notedAt?: string;
  prompt?: boolean;
  /** A pulsing mark. This watch is still waiting for a first message. */
  attention?: boolean;
}) {
  const styles = useThemedStyles(rowStyles);
  const theme = useTheme();
  const photo = card.photos[0]?.url;
  const [rowWidth, setRowWidth] = useState(0);
  const scanFrame =
    scan || compact
      ? rowWidth > 0
        ? Math.min(Math.round(rowWidth * layout.gridScanWidthShare), size.gridPhoto)
        : size.gridScan
      : undefined;
  const frame = photoWidth ?? scanFrame ?? size.gridPhoto;
  const photoStyle = [styles.photo, compact && styles.photoCompact, { width: frame }];
  const messageLabel = inConversation ? 'In conversation' : 'Message';
  // In a list where a row can be swiped, the end of that swipe is not a tap.
  const guard = useSwipeGuard();

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setRowWidth((current) => (Math.abs(current - next) < 1 ? current : next));
      }}
      style={[
        styles.row,
        compact && styles.rowCompact,
        selected && styles.rowSelected,
        compact && attention && styles.rowMarked,
      ]}>
      {/* Gesture Handler's pressable. Wishlist rows sit under a pan, and React
          Native's Pressable never hears that tap. The photograph and the type
          open the watch separately so the action beside them can be a button
          of its own: a button inside a button is invalid on the web, and one
          tap would both write to the dealer and open the watch. */}
      <View style={compact ? styles.photoSlot : undefined}>
        {scan && card.photos.length > 0 ? (
          <ScanPhotos photos={card.photos} width={frame} onPress={guard(onPress)} />
        ) : (
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={guard(onPress)}>
            {photo ? (
              // `contain`, unlike the card's `cover`. A row is for recognising a
              // watch, and a crop at this size magnifies the dial past the case
              // shape — which is most of what tells one vintage watch from another.
              <Image source={{ uri: photo }} style={photoStyle} contentFit="contain" />
            ) : (
              <View style={[photoStyle, styles.photoEmpty]}>
                <Text style={styles.photoEmptyLabel}>No photograph</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.details}>
        {compact ? (
          // The photograph opens the watch. Everything beside it is the
          // message, because on the wishlist that is the next thing to do.
          // A sold watch with no thread has no message, so it opens the watch.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              onMessage
                ? `${inConversation ? 'Open the conversation about' : 'Message the dealer about'} ${formatTitle(card)}`
                : formatTitle(card)
            }
            accessibilityState={{ busy: messagePending }}
            onPress={guard(() => {
              if (onMessage) {
                if (!messagePending) onMessage();
              } else onPress?.();
            })}>
            <ListingSummary card={card} compact note={note} notedAt={notedAt} prompt={prompt} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={formatTitle(card)}
            onPress={guard(onPress)}>
            <ListingSummary card={card} dense={scan || Boolean(onMessage)} />
          </Pressable>
        )}

        {onMessage && !compact ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              inConversation
                ? `In conversation about ${formatTitle(card)}`
                : `Message ${card.dealer?.name ?? 'the dealer'} about ${formatTitle(card)}`
            }
            accessibilityState={{ busy: messagePending, disabled: messagePending }}
            disabled={messagePending}
            onPress={guard(onMessage)}
            style={({ pressed }) => [styles.message, pressed && styles.pressed]}>
            {messagePending ? (
              <ActivityIndicator color={theme.color.text} />
            ) : (
              <Image
                source={require('../../assets/message.svg')}
                style={styles.messageMark}
                contentFit="contain"
                tintColor={theme.color.text}
                accessible={false}
              />
            )}
            <Text style={styles.messageLabel}>{messageLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {compact && attention && onMessage ? (
        <InquireMark
          anchor="row"
          label={`Inquire about ${formatTitle(card)}`}
          onPress={() => {
            if (!messagePending) guard(onMessage)?.();
          }}
        />
      ) : null}
    </View>
  );
}

const rowStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    // Stretch, not centre: a row taller than the photograph would otherwise
    // leave a band of empty surface above and below it.
    alignItems: 'stretch' as const,
    backgroundColor: theme.color.surface,
    borderRadius: radius.md,
    // Transparent rather than absent: a border that appears only once selected
    // would move the row by a pixel as the cursor lands on it.
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden' as const,
  },
  rowSelected: {
    borderColor: theme.color.brass,
  },
  // A divider between rows does the separating a card used to. Centred, so
  // the shorter photograph sits on the middle of the type beside it.
  rowCompact: {
    alignItems: 'center' as const,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingVertical: space.md,
    overflow: 'visible' as const,
  },
  rowMarked: {
    position: 'relative' as const,
    paddingRight: size.unread + space.sm,
  },
  // A fixed shape, close to what dealers shoot: a watch photographed upright,
  // about five by seven. The height used to come from the type beside it, so a
  // name that wrapped made the frame taller, and the same photograph was
  // magnified and cut differently in one row than in the next.
  frame: {
    backgroundColor: theme.color.photoMat,
    overflow: 'hidden' as const,
  },
  fill: {
    width: '100%' as const,
    height: '100%' as const,
  },
  photo: {
    aspectRatio: 5 / 7,
    // Centred rather than stretched: at a large accessibility text size the
    // type outgrows the frame, and the frame must not change shape with it.
    alignSelf: 'center' as const,
    backgroundColor: theme.color.photoMat,
  },
  photoSlot: {
    position: 'relative' as const,
  },
  // Off the card, the photograph needs its own corners. `md`, one step past a
  // thumbnail's `sm`, so the frame reads as rounded at this size.
  photoCompact: {
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
  photoEmpty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  photoEmptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  details: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center' as const,
  },
  // The same ink as the shop's Message control, at `size.follow` rather than
  // `controlMin`. It hugs the word. A full-width bar made every row a poster,
  // and the photograph had to grow to fill it.
  message: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    height: size.follow,
    paddingHorizontal: size.follow / 2,
    marginLeft: space.md,
    marginBottom: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.field,
  },
  messageLabel: {
    ...type.control,
    color: theme.color.text,
  },
  messageMark: {
    width: size.dealerSocialMark,
    height: size.dealerSocialMark,
  },
  pressed: {
    opacity: 0.72,
  },
  bars: {
    position: 'absolute' as const,
    left: space.xs,
    right: space.xs,
    bottom: space.xs,
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
});

/**
 * The photographs of one watch, paged sideways. A tap still opens the listing.
 * A drag does not: the press that ends a swipe would, and the row would open
 * under the thumb that was only turning the page.
 */
function ScanPhotos({
  photos,
  width,
  onPress,
}: {
  photos: DeckPhoto[];
  width: number;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(rowStyles);
  const [page, setPage] = useState(0);
  const [dragged, setDragged] = useState(false);
  const height = width * (7 / 5);

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

  return (
    <View style={[styles.frame, { width, height }]}>
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
          // React Native's pressable, not Gesture Handler's. The handler's
          // press claims the touch on contact, so the frame never pages: the
          // drag becomes a tap and the listing opens. This row is not under a
          // swipe-to-remove, which is why the rest of the row still needs the
          // other pressable.
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
            style={{ width, height }}>
            <Image source={{ uri: photo.url }} style={styles.fill} contentFit="contain" />
          </FramePressable>
        ))}
      </ScrollView>
      {photos.length > 1 ? (
        <View pointerEvents="none" style={styles.bars}>
          {photos.map((photo, index) => (
            <View key={photo.id} style={[styles.bar, index === page && styles.barOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
