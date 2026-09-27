import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { motion, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * A post's photographs, one at a time, as wide as the post and square. A strip
 * of small thumbnails made every watch a contact sheet; the photograph is the
 * thing being offered and it should be the largest thing on the screen.
 *
 * Chevrons rather than the deck's invisible tap zones: on the deck a tap is
 * the whole grammar of the screen, but a post is read and scrolled, so the way
 * through the roll has to be visible. Paging does not wrap — a chevron is gone
 * when there is nothing that way.
 */
export function PostPhotos({ urls }: { urls: string[] }) {
  const styles = useThemedStyles(photoStyles);
  const [index, setIndex] = useState(0);
  const at = Math.min(index, urls.length - 1);
  const next = urls[at + 1];

  // Warm the next one while this one is being looked at.
  useEffect(() => {
    if (!next) return;
    void Image.prefetch(next);
  }, [next]);

  if (urls.length === 0) return null;
  const paged = urls.length > 1;

  return (
    <View style={styles.frame}>
      <Image
        source={{ uri: urls[at] }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={motion.fast}
        recyclingKey={urls[at]}
        accessible={false}
      />
      {paged ? (
        <>
          {at > 0 ? (
            <Step side="left" label="Previous photo" onPress={() => setIndex(at - 1)} />
          ) : null}
          {at < urls.length - 1 ? (
            <Step side="right" label="Next photo" onPress={() => setIndex(at + 1)} />
          ) : null}
          <View style={styles.dotRow} pointerEvents="none">
            <View style={styles.dots}>
              {/* Keyed by position, not by url: the same photograph may be in
                  the roll twice, and two identical keys collapse to one dot. */}
              {urls.map((url, dot) => (
                <View key={`${dot}-${url}`} style={[styles.dot, dot === at && styles.dotOn]} />
              ))}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function Step({
  side,
  label,
  onPress,
}: {
  side: 'left' | 'right';
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(photoStyles);
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.step, styles[side], pressed && styles.pressed]}>
      <MaterialCommunityIcons
        name={side === 'left' ? 'chevron-left' : 'chevron-right'}
        size={size.icon}
        color={theme.color.onOverlay}
      />
    </Pressable>
  );
}

const STEP = 32;

const photoStyles = (theme: Theme) => ({
  frame: {
    width: '100%' as const,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.surfaceSunken,
  },
  step: {
    position: 'absolute' as const,
    top: '50%' as const,
    marginTop: -STEP / 2,
    width: STEP,
    height: STEP,
    borderRadius: STEP / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    // A scrim disc, because a white chevron on a white dial is not there.
    backgroundColor: theme.color.overlay,
  },
  left: { left: space.sm },
  right: { right: space.sm },
  pressed: { opacity: 0.72 },
  dotRow: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: space.sm,
    alignItems: 'center' as const,
  },
  // On the same scrim disc as the chevrons. A bare dot disappeared into a
  // steel bracelet; every watch in the roll is a different background.
  dots: {
    flexDirection: 'row' as const,
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.color.overlay,
  },
  dot: {
    width: size.dot,
    height: size.dot,
    borderRadius: size.dot / 2,
    backgroundColor: theme.color.onOverlayFaint,
  },
  // Tan, not white: the mark for where you are is the one thing on a
  // photograph that is not white.
  dotOn: {
    backgroundColor: theme.color.onOverlayAccent,
  },
});
