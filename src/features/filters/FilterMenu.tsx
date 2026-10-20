import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FilterButton } from '@/components/FilterButton';
import { useIsDesktopWeb } from '@/lib/layout';
import { inset, layout, motion, radius, shadow, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { FilterPanel } from './FilterPanel';
import { useOpenFilters } from './open';
import type { Surface } from './provider';

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Phone and tablet: filters are a stack modal. Desktop web: the same panel in a
 * positioned dropdown beside the trigger; choices apply live, backdrop dismisses.
 */
export function FilterMenu({
  surface,
  dealerId,
  count,
  triggerVariant = 'icon',
}: {
  surface: Surface;
  dealerId?: string;
  count: number;
  triggerVariant?: 'icon' | 'text';
}) {
  const isDesktopWeb = useIsDesktopWeb();
  const openSheet = useOpenFilters();
  const styles = useThemedStyles(menuStyles);
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const progress = useSharedValue(0);

  const finishClose = useCallback(() => {
    setOpen(false);
    setAnchor(null);
  }, []);

  const close = useCallback(() => {
    progress.value = withTiming(0, { duration: motion.fast }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [finishClose, progress]);

  const present = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const onTrigger = useCallback(() => {
    if (open) close();
    else if (isDesktopWeb) present();
    else openSheet(surface, dealerId);
  }, [close, dealerId, isDesktopWeb, open, openSheet, present, surface]);

  useEffect(() => {
    if (!open) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: motion.smooth });
  }, [open, progress]);

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.98 + progress.value * 0.02 },
      { translateX: (1 - progress.value) * -8 },
    ],
  }));

  const frame = anchor ? dropdownFrame(anchor) : null;

  return (
    <View ref={anchorRef} style={styles.slot} collapsable={false}>
      <FilterButton count={count} onPress={onTrigger} variant={triggerVariant} />

      {isDesktopWeb ? (
        <Modal visible={open} transparent animationType="none" onRequestClose={close}>
          <View style={styles.modalRoot}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close filters">
              <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
            </Pressable>
            {frame ? (
              <Animated.View
                style={[
                  styles.panel,
                  panelStyle,
                  {
                    top: frame.top,
                    left: frame.left,
                    width: frame.width,
                    maxHeight: frame.maxHeight,
                  },
                ]}>
                <FilterPanel surface={surface} dealerId={dealerId} variant="dropdown" />
              </Animated.View>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function dropdownFrame(anchor: Anchor) {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const width = layout.reading;
  const gutter = inset.screen;
  const top = Math.max(space.md, anchor.y);
  let left = anchor.x + anchor.width + space.sm;
  if (left + width > screenW - gutter) {
    left = anchor.x - width - space.sm;
  }
  left = Math.max(gutter, Math.min(left, screenW - width - gutter));
  const maxHeight = screenH - top - space.lg;
  return { top, left, width, maxHeight };
}

const menuStyles = (theme: Theme) => ({
  slot: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modalRoot: {
    flex: 1,
  },
  scrim: {
    backgroundColor: theme.color.overlay,
  },
  panel: {
    position: 'absolute' as const,
    flexDirection: 'column' as const,
    borderRadius: radius.lg,
    backgroundColor: theme.color.surface,
    overflow: 'hidden' as const,
    boxShadow: shadow.card,
  },
});
