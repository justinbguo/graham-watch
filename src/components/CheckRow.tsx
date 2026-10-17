import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { HIT_TARGET, inset, motion, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const ease = Easing.out(Easing.cubic);

/** Trailing square used by `CheckRow` and person-picker rows. */
export function CheckMark({ selected }: { selected: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(rowStyles);
  const on = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: motion.smooth, easing: ease });
  }, [on, selected]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], ['transparent', theme.color.accent]),
    borderColor: interpolateColor(on.value, [0, 1], [theme.color.border, theme.color.accent]),
    transform: [{ scale: interpolate(on.value, [0, 1], [1, 1.04]) }],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: interpolate(on.value, [0, 1], [0.5, 1]) }],
  }));

  return (
    <Animated.View style={[styles.box, boxStyle]}>
      <Animated.View style={markStyle}>
        <MaterialCommunityIcons name="check" size={size.checkMark} color={theme.color.onAccent} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A label with a trailing checkbox. Filters, onboarding, and any future
 * multi-select list share this row so the check always feels the same.
 */
export function CheckRow({
  label,
  selected,
  count,
  onPress,
  divider = true,
}: {
  label: string;
  selected: boolean;
  count?: number;
  onPress: () => void;
  divider?: boolean;
}) {
  const styles = useThemedStyles(rowStyles);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}>
      <View style={[styles.row, divider && styles.divider]}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.trail}>
          {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
          <CheckMark selected={selected} />
        </View>
      </View>
    </Pressable>
  );
}

const rowStyles = (theme: Theme) => ({
  press: {
    alignSelf: 'stretch' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
    paddingVertical: inset.controlY,
    minHeight: HIT_TARGET,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  label: {
    ...type.labelStrong,
    color: theme.color.ink,
    flex: 1,
    minWidth: 0,
  },
  trail: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    flexShrink: 0,
  },
  count: {
    ...type.caption,
    color: theme.color.inkFaint,
  },
  box: {
    width: size.check,
    height: size.check,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
