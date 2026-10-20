import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

const MIN_THUMB = 100;
const ASPECT = 5 / 7;

function thumbWidth(containerWidth: number, count: number) {
  if (count === 0 || containerWidth <= 0) return { width: 0, scroll: false };
  const gap = space.sm;
  const fit = (containerWidth - gap * (count - 1)) / count;
  if (fit >= MIN_THUMB) {
    return { width: fit, scroll: false };
  }
  const width = Math.min(size.quotePhoto, MIN_THUMB);
  const total = width * count + gap * (count - 1);
  return { width, scroll: total > containerWidth };
}

/**
 * Deal sheet photographs: as many as fit across the row at once; scroll when they
 * would shrink past a readable thumb.
 */
export function DealListingPhotoStrip({
  urls,
  onPress,
}: {
  urls: string[];
  onPress?: () => void;
}) {
  const styles = useThemedStyles(stripStyles);
  const [width, setWidth] = useState(0);
  const { width: thumbW, scroll } = thumbWidth(width, urls.length);

  const body =
    urls.length === 0 ? (
      <View style={[styles.empty, width > 0 && { width }]}>
        <Text style={styles.emptyLabel}>No photograph</Text>
      </View>
    ) : (
      urls.map((uri) => (
        <Image
          key={uri}
          source={{ uri }}
          style={{ width: thumbW, aspectRatio: ASPECT, borderRadius: radius.md }}
          contentFit="contain"
          accessible={false}
        />
      ))
    );

  const row = (
    <View style={styles.slot} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={[styles.row, !scroll && styles.rowFit]}>
        {scroll ? (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </View>
    </View>
  );

  if (!onPress) return row;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View listing"
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {row}
    </Pressable>
  );
}

const stripStyles = (theme: Theme) => ({
  slot: {
    width: '100%' as const,
  },
  row: {
    width: '100%' as const,
    minHeight: size.quotePhoto * ASPECT,
  },
  rowFit: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  scrollContent: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingRight: space.xs,
  },
  empty: {
    aspectRatio: ASPECT,
    maxWidth: size.quotePhoto,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: space.xs,
  },
  emptyLabel: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  pressed: {
    opacity: 0.72,
  },
});
