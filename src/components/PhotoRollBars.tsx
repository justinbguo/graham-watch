import { useEffect } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { DeckPhoto } from '@/lib/models';
import { layout, motion, radius, scrimTop, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * One pill per photograph. On the buy deck the track is narrower than the card
 * column and sits between the catalogue count and the stack. On a listing hero
 * the track is full width on `scrimTop`. In the full-screen viewer it uses the
 * same track width as the deck and sits in the layout row above the image.
 */
export function PhotoRollBars({
  photos,
  index,
  placement,
  overlayTop,
}: {
  photos: DeckPhoto[];
  index: number;
  placement: 'deck' | 'overlay' | 'viewer';
  overlayTop?: number;
}) {
  const styles = useThemedStyles(barStyles);
  if (photos.length <= 1) return null;

  const overlay = placement === 'overlay';
  const viewer = placement === 'viewer';

  return (
    <View
      style={[
        styles.row,
        overlay ? styles.rowOverlay : viewer ? styles.rowViewer : styles.rowDeck,
        overlay && overlayTop != null ? { top: overlayTop } : null,
        overlay ? topFade : null,
      ]}
      pointerEvents="none">
      {photos.map((photo, at) => (
        <RollSegment key={photo.id} active={at === index} placement={placement} />
      ))}
    </View>
  );
}

function RollSegment({
  active,
  placement,
}: {
  active: boolean;
  placement: 'deck' | 'overlay' | 'viewer';
}) {
  const theme = useTheme();
  const styles = useThemedStyles(barStyles);
  const deck = placement === 'deck';
  const on = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, { duration: motion.fast });
  }, [active, on]);

  const rollIdle = theme.color.textFaint;
  const rollActive = theme.color.accent;
  const faint = theme.color.onOverlayFaint;
  const accent = theme.color.onOverlayAccent;

  const animated = useAnimatedStyle(() => {
    if (deck) {
      return {
        backgroundColor: interpolateColor(on.value, [0, 1], [rollIdle, rollActive]),
        transform: [{ scaleY: 0.92 + on.value * 0.08 }],
      };
    }
    return {
      backgroundColor: interpolateColor(on.value, [0, 1], [faint, accent]),
      opacity: 0.65 + on.value * 0.35,
    };
  }, [deck, rollIdle, rollActive, faint, accent]);

  return (
    <Animated.View
      style={[styles.segment, deck ? styles.segmentDeck : styles.segmentOverlay, animated]}
    />
  );
}

const topFade = Platform.select<ViewStyle>({
  web: { backgroundImage: scrimTop } as ViewStyle,
  default: { experimental_backgroundImage: scrimTop },
});

const barStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  rowDeck: {
    alignSelf: 'center' as const,
    width: `${layout.photoRollTrackShare * 100}%` as const,
    paddingHorizontal: 0,
    gap: space.sm,
  },
  /** Full-screen viewer: deck track width, overlay inks, glued above the photograph. */
  rowViewer: {
    alignSelf: 'center' as const,
    width: `${layout.photoRollTrackShare * 100}%` as const,
    paddingHorizontal: 0,
    gap: space.sm,
    paddingBottom: space.sm,
  },
  rowOverlay: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    zIndex: 2,
  },
  segment: {
    flex: 1,
    borderRadius: radius.full,
  },
  segmentDeck: {
    height: size.segmentDeck,
  },
  segmentOverlay: {
    height: size.segment,
  },
});
