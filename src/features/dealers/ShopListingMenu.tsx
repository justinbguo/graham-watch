import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { HIT_TARGET, inset, motion, radius, shadow, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const MENU_WIDTH = 200;

type Anchor = { x: number; y: number; width: number; height: number };

export function ShopListingMenu({
  sold,
  hidden,
  disabled,
  onMarkSold,
  onEdit,
  onToggleVisibility,
  onDelete,
}: {
  sold: boolean;
  hidden: boolean;
  disabled?: boolean;
  onMarkSold: () => void;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete?: () => void;
}) {
  const styles = useThemedStyles(menuStyles);
  const theme = useTheme();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const progress = useSharedValue(0);

  const finishClose = useCallback(() => setOpen(false), []);

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

  useEffect(() => {
    if (!open) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: motion.smooth });
  }, [open, progress]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.94 + progress.value * 0.06 },
      { translateY: (1 - progress.value) * -6 },
    ],
  }));

  const menuFrame = anchor ? menuPosition(anchor) : null;

  return (
    <View ref={anchorRef} style={styles.slot} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Listing actions"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => (open ? close() : present())}
        style={({ pressed }) => [styles.dots, pressed && styles.pressed, disabled && styles.disabled]}>
        <MaterialCommunityIcons
          name="dots-vertical"
          size={size.icon}
          color={open ? theme.color.text : theme.color.textMuted}
        />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close menu">
            <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />
          </Pressable>
          {menuFrame ? (
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.menu,
                panelStyle,
                { top: menuFrame.top, left: menuFrame.left, width: MENU_WIDTH },
              ]}>
              <MenuItem
                label={sold ? 'Mark available' : 'Mark sold'}
                icon="tag-outline"
                onPress={() => {
                  close();
                  onMarkSold();
                }}
              />
              <MenuItem
                label="Edit listing"
                icon="pencil-outline"
                onPress={() => {
                  close();
                  onEdit();
                }}
              />
              <MenuItem
                label={hidden ? 'Show listing' : 'Hide listing'}
                icon={hidden ? 'eye-outline' : 'eye-off-outline'}
                onPress={() => {
                  close();
                  onToggleVisibility();
                }}
              />
              {onDelete ? (
                <MenuItem
                  label="Delete listing"
                  icon="trash-can-outline"
                  tone="danger"
                  onPress={() => {
                    close();
                    onDelete();
                  }}
                />
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function menuPosition(anchor: Anchor) {
  const { width: screenW } = Dimensions.get('window');
  const gutter = inset.screen;
  const top = anchor.y + anchor.height + space.xs;
  let left = anchor.x + anchor.width - MENU_WIDTH;
  left = Math.max(gutter, Math.min(left, screenW - MENU_WIDTH - gutter));
  return { top, left };
}

function MenuItem({
  label,
  icon,
  tone,
  onPress,
}: {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: 'danger';
  onPress: () => void;
}) {
  const styles = useThemedStyles(menuStyles);
  const theme = useTheme();
  const color = tone === 'danger' ? theme.color.danger : theme.color.ink;

  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={size.iconSmall} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const menuStyles = (theme: Theme) => ({
  slot: {
    width: HIT_TARGET,
    flexShrink: 0,
    alignItems: 'center' as const,
    justifyContent: 'flex-start' as const,
  },
  dots: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
  modalRoot: {
    flex: 1,
  },
  scrim: {
    backgroundColor: theme.color.overlay,
  },
  menu: {
    position: 'absolute' as const,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    overflow: 'hidden' as const,
    boxShadow: shadow.card,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: inset.controlX,
    minHeight: HIT_TARGET,
  },
  label: {
    ...type.labelStrong,
  },
});
