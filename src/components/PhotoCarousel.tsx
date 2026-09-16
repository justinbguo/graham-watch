import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DeckPhoto } from '@/lib/models';
import { motion, radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Tap the right of the photo for the next one, the left to go back — the same
 * grammar as every other card the user has met. Paging never wraps: reaching the
 * last photo and landing back on the first reads as a glitch.
 *
 * On a card the photograph fills its frame edge to edge. A watch centred in a
 * band of matte reads as a broken image, and the crop costs less than the
 * letterbox: dealers shoot the watch in the middle of the frame.
 *
 * `viewer` is the same paging on a black field with the whole photograph in
 * frame, for the full-screen route. That is where nothing may be cropped.
 *
 * expo-image rather than React Native's Image because these are large dealer
 * photographs and it caches them to disk; RN's Image only caches in memory, so
 * every return to a card would refetch.
 */
export function PhotoCarousel({
  photos,
  active,
  variant = 'card',
  initialIndex = 0,
  onExpand,
}: {
  photos: DeckPhoto[];
  active: boolean;
  variant?: 'card' | 'viewer';
  initialIndex?: number;
  onExpand?: (index: number) => void;
}) {
  const styles = useThemedStyles(carouselStyles);
  // A card sits inside a screen that already handled the notch; the viewer fills
  // the display and has to keep the counter clear of the home indicator itself.
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  const current = photos[Math.min(index, photos.length - 1)];
  const next = photos[index + 1];

  // Warm the next photo while this one is still being looked at.
  useEffect(() => {
    if (next?.url) Image.prefetch(next.url);
  }, [next?.url]);

  if (!current) {
    return (
      <View style={[styles.photo, styles.empty]}>
        <Text style={styles.emptyLabel}>No photograph</Text>
      </View>
    );
  }

  const step = (by: number) =>
    setIndex((value) => Math.min(Math.max(value + by, 0), photos.length - 1));

  const expand = onExpand ? () => onExpand(index) : undefined;
  const paged = photos.length > 1;

  return (
    <View style={[styles.photo, variant === 'viewer' && styles.viewer]}>
      <Image
        source={{ uri: current.url }}
        style={StyleSheet.absoluteFill}
        contentFit={variant === 'viewer' ? 'contain' : 'cover'}
        transition={motion.fast}
        recyclingKey={current.id}
      />

      {/* A plate number, not a row of story bars: it says how many shots there
          are rather than implying it, and it stays legible on a watch shot
          against white, which half of them are. */}
      {paged ? (
        <View
          style={
            variant === 'viewer'
              ? [styles.counter, styles.counterViewer, { bottom: insets.bottom + space.lg }]
              : [styles.counter, styles.counterCard]
          }
          pointerEvents="none">
          <Text style={styles.counterLabel}>
            {index + 1} / {photos.length}
          </Text>
        </View>
      ) : null}

      {/* Only the top card takes taps; a card underneath is not being read. The
          zones exist even for a lone photo, because the long press does not
          need a second one to be worth offering. */}
      {active ? (
        <View style={styles.zones}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paged ? 'Previous photo' : 'Photo'}
            accessibilityHint={expand ? 'Long press to see it full screen' : undefined}
            style={styles.zone}
            onPress={paged ? () => step(-1) : undefined}
            onLongPress={expand}
          />
          {paged ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next photo"
              accessibilityHint={expand ? 'Long press to see it full screen' : undefined}
              style={styles.zone}
              onPress={() => step(1)}
              onLongPress={expand}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const carouselStyles = (theme: Theme) => ({
  photo: {
    flex: 1,
    backgroundColor: theme.color.surfaceSunken,
    overflow: 'hidden' as const,
  },
  // Black in both themes. A photograph shown whole needs a field that does not
  // compete with it, and a light one reads as an unfinished screen.
  viewer: {
    backgroundColor: '#000000',
  },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  counter: {
    position: 'absolute' as const,
    right: space.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs / 2,
    borderRadius: radius.sm,
    backgroundColor: theme.color.overlay,
    zIndex: 2,
  },
  // Top right on a card: the bottom of the photograph belongs to the caption,
  // and a plate sitting on the fade beside the name reads as a second label.
  counterCard: {
    top: space.md,
  },
  counterViewer: {
    bottom: space.md,
  },
  counterLabel: {
    ...type.control,
    color: theme.color.onOverlay,
  },
  zones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row' as const,
  },
  zone: {
    flex: 1,
  },
});
