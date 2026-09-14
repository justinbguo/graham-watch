import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/lib/layout';
import { inset, layout, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type Tab = {
  key: string;
  label: string;
  focused: boolean;
  accessibilityLabel?: string;
  renderIcon: (color: string) => ReactNode;
  onPress: () => void;
  onLongPress: () => void;
};

const PRESS_SCALE = 0.92;
/** Short enough to read as the control answering, not as an animation. */
const PRESS_DURATION = 90;

/**
 * The navigator's own bar draws a glyph and a word in a fixed 49pt strip and
 * gives no way in between: the press, the brass selected state, and the rail's
 * layout are all beyond its options, and the last pass was already fighting it
 * with an icon height override to stop the labels clipping.
 *
 * This draws the same tabs from the same screen options — the icon a screen
 * declares, its title, its accessibility label — and keeps the navigator's
 * press semantics exactly: emit `tabPress`, respect a prevented default, then
 * navigate. Nothing about where a tap goes changed.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const isWide = useIsWide();

  const tabs: Tab[] = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const focused = state.index === index;
    const label =
      typeof options.tabBarLabel === 'string'
        ? options.tabBarLabel
        : (options.title ?? route.name);

    return {
      key: route.key,
      label,
      focused,
      accessibilityLabel: options.tabBarAccessibilityLabel,
      renderIcon: (color) => options.tabBarIcon?.({ focused, color, size: size.icon }) ?? null,
      onPress: () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (focused || event.defaultPrevented) return;
        // The bar under the thumb answers before the screen does.
        if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
        navigation.navigate(route.name, route.params);
      },
      onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
    };
  });

  return isWide ? <Rail tabs={tabs} /> : <Bar tabs={tabs} />;
}

/** On a phone. The tab you are on is the brass one; nothing else marks it. */
function Bar({ tabs }: { tabs: Tab[] }) {
  const styles = useThemedStyles(barStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        // The bar owns the home indicator, and the side insets in landscape.
        {
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      <View accessibilityRole="tablist" style={styles.row}>
        {tabs.map((tab) => (
          <BarTab key={tab.key} tab={tab} />
        ))}
      </View>
    </View>
  );
}

function BarTab({ tab }: { tab: Tab }) {
  const styles = useThemedStyles(barStyles);
  const theme = useTheme();
  const press = usePress();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: tab.focused }}
      // React Native Web does not carry `selected` across to the DOM, and a tab
      // that never reports being the current one is a tab list with no answer.
      aria-selected={tab.focused}
      accessibilityLabel={tab.accessibilityLabel ?? tab.label}
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      onPressIn={press.down}
      onPressOut={press.up}
      style={styles.tab}>
      <Animated.View style={[styles.stack, press.style]}>
        {tab.renderIcon(tab.focused ? theme.color.brass : theme.color.textFaint)}
        <Text style={[styles.label, tab.focused && styles.labelActive]} numberOfLines={1}>
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * On a wide window. A rail is a list, so selection is the list's own grammar —
 * a brass left rule and a quiet surface shift, the same as a chosen filter.
 */
function Rail({ tabs }: { tabs: Tab[] }) {
  const styles = useThemedStyles(railStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.rail,
        {
          // The rail stands beside the screens, so it clears the notch itself.
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
        },
      ]}>
      {tabs.map((tab) => (
        <RailTab key={tab.key} tab={tab} />
      ))}
    </View>
  );
}

function RailTab({ tab }: { tab: Tab }) {
  const styles = useThemedStyles(railStyles);
  const theme = useTheme();
  const press = usePress();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: tab.focused }}
      // React Native Web does not carry `selected` across to the DOM, and a tab
      // that never reports being the current one is a tab list with no answer.
      aria-selected={tab.focused}
      accessibilityLabel={tab.accessibilityLabel ?? tab.label}
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      onPressIn={press.down}
      onPressOut={press.up}
      style={[styles.tab, tab.focused && styles.tabActive]}>
      <Animated.View style={[styles.line, press.style]}>
        {tab.renderIcon(tab.focused ? theme.color.brass : theme.color.textFaint)}
        <Text style={[styles.label, tab.focused && styles.labelActive]} numberOfLines={1}>
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** A tab gives under the thumb and comes back. Scale only: nothing reflows. */
function usePress() {
  const pressed = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }],
  }));

  return {
    style,
    down: () => {
      pressed.value = withTiming(1, { duration: PRESS_DURATION });
    },
    up: () => {
      pressed.value = withTiming(0, { duration: PRESS_DURATION });
    },
  };
}

const barStyles = (theme: Theme) => ({
  bar: {
    backgroundColor: theme.color.surface,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  row: {
    flexDirection: 'row' as const,
    height: size.tabBar,
  },
  tab: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stack: {
    alignItems: 'center' as const,
    gap: space.xs,
  },
  label: {
    ...type.tab,
    color: theme.color.textFaint,
  },
  labelActive: {
    color: theme.color.brass,
  },
});

const railStyles = (theme: Theme) => ({
  rail: {
    width: layout.rail,
    gap: space.xs,
    paddingRight: space.md,
    backgroundColor: theme.color.surface,
    borderRightWidth: 1,
    borderRightColor: theme.color.border,
  },
  tab: {
    justifyContent: 'center' as const,
    minHeight: size.controlMin,
    paddingHorizontal: inset.controlX,
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    borderLeftWidth: size.rule,
    borderLeftColor: 'transparent',
  },
  tabActive: {
    backgroundColor: theme.color.surfaceSunken,
    borderLeftColor: theme.color.brass,
  },
  line: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  label: {
    ...type.label,
    color: theme.color.textFaint,
  },
  labelActive: {
    color: theme.color.brass,
  },
});
