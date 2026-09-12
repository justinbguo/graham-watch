import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeckPhoto } from '@/lib/models';
import { motion, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Tap the right of the photo for the next one, the left to go back — the same
 * grammar as every other card the user has met. Paging never wraps: reaching the
 * last photo and landing back on the first reads as a glitch.
 *
 * expo-image rather than React Native's Image because these are large dealer
 * photographs and it caches them to disk; RN's Image only caches in memory, so
 * every return to a card would refetch.
 */
export function PhotoCarousel({ photos, active }: { photos: DeckPhoto[]; active: boolean }) {
  const styles = useThemedStyles(carouselStyles);
  const [index, setIndex] = useState(0);

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

  return (
    <View style={styles.photo}>
      <Image
        source={{ uri: current.url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={motion.fast}
        recyclingKey={current.id}
      />

      {photos.length > 1 ? (
        <>
          <View style={styles.segments} pointerEvents="none">
            {photos.map((photo, position) => (
              <View
                key={photo.id}
                style={[styles.segment, position === index && styles.segmentActive]}
              />
            ))}
          </View>

          {/* Only the top card takes taps; a card underneath is not being read. */}
          {active ? (
            <View style={styles.zones}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
                style={styles.zone}
                onPress={() => step(-1)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next photo"
                style={styles.zone}
                onPress={() => step(1)}
              />
            </View>
          ) : null}
        </>
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
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  // Segments, not dots: they show how much of the set is left at a glance.
  segments: {
    position: 'absolute' as const,
    top: space.md,
    left: space.md,
    right: space.md,
    flexDirection: 'row' as const,
    gap: space.xs,
    zIndex: 2,
  },
  segment: {
    flex: 1,
    height: size.progress,
    borderRadius: radius.pill,
    backgroundColor: theme.color.overlay,
  },
  segmentActive: {
    backgroundColor: theme.color.surface,
  },
  zones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row' as const,
  },
  zone: {
    flex: 1,
  },
});
