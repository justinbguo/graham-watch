import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsWide } from '@/lib/layout';
import { layout, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type Tab = {
  key: string;
  label: string;
  focused: boolean;
  badge?: number;
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
 * gives no way in between: the press, the dark floor, the counts, and the
 * rail's layout are all beyond its options.
 *
 * This draws the same tabs from the same screen options — the icon a screen
 * declares, its title, its badge, its accessibility label — and keeps the
 * navigator's press semantics exactly: emit `tabPress`, respect a prevented
 * default, then navigate. Nothing about where a tap goes changed.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const isWide = useIsWide();

  const tabs: Tab[] = state.routes.flatMap((route, index) => {
    const { options } = descriptors[route.key];
    // `href: null` keeps a route in this navigator without a seat on the bar.
    // Expo Router implements that as `display: 'none'` on the item, and this
    // bar draws the items itself, so it has to honour that.
    if (hiddenTab(options.tabBarItemStyle)) return [];
    const focused = state.index === index;
    const label =
      typeof options.tabBarLabel === 'string'
        ? options.tabBarLabel
        : (options.title ?? route.name);

    return {
      key: route.key,
      label,
      focused,
      badge: typeof options.tabBarBadge === 'number' ? options.tabBarBadge : undefined,
      accessibilityLabel: options.tabBarAccessibilityLabel,
      renderIcon: (color) => options.tabBarIcon?.({ focused, color, size: size.tabIcon }) ?? null,
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

/**
 * On a phone. A dark floor under a pale app, glyphs and nothing else: the tab
 * you are on is the white one, solid where the others are outlines. The words are gone because four of them at 11pt
 * were four things to read on every screen, and the glyphs carry it — but the
 * word stays as each tab's accessibility label, which is what a screen reader
 * announces and what a pointer shows on hover.
 */
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
      accessibilityLabel={tabLabel(tab)}
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      onPressIn={press.down}
      onPressOut={press.up}
      style={styles.tab}>
      <Animated.View style={press.style}>
        {tab.renderIcon(tab.focused ? theme.color.onBarActive : theme.color.onBar)}
        <Badge count={tab.badge} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * On a wide window. The same dark strip stood on its end, so the app has one
 * floor rather than two chromes that happen to share a palette.
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
      aria-selected={tab.focused}
      accessibilityLabel={tabLabel(tab)}
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      onPressIn={press.down}
      onPressOut={press.up}
      style={styles.tab}>
      <Animated.View style={press.style}>
        {tab.renderIcon(tab.focused ? theme.color.onBarActive : theme.color.onBar)}
        <Badge count={tab.badge} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * A count rides the corner of the glyph, half on and half off it. It is spoken
 * as part of the tab's label rather than drawn and left silent, because a
 * number nobody reads out is a number a screen reader user never learns about.
 *
 * Red with a white count, on every tab and whether or not it is the one you
 * are on. It used to be white and invert to dark on the current tab, because
 * a white pill on a white glyph is one shape. Red stands off both the idle
 * and the active glyph, so it no longer has to change.
 */
function Badge({ count }: { count?: number }) {
  const styles = useThemedStyles(badgeStyles);
  if (!count) return null;

  return (
    <View style={styles.badge} accessible={false}>
      <Text style={styles.count} numberOfLines={1}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

function hiddenTab(style: StyleProp<ViewStyle> | undefined) {
  return StyleSheet.flatten(style)?.display === 'none';
}

function tabLabel(tab: Tab) {
  const name = tab.accessibilityLabel ?? tab.label;
  return tab.badge ? `${name}, ${tab.badge}` : name;
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
    backgroundColor: theme.color.bar,
  },
  row: {
    flexDirection: 'row' as const,
    height: size.tabBar,
    alignItems: 'center' as const,
  },
  tab: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'stretch' as const,
  },
});

const railStyles = (theme: Theme) => ({
  rail: {
    width: layout.rail,
    alignItems: 'center' as const,
    gap: space.sm,
    backgroundColor: theme.color.bar,
  },
  tab: {
    width: size.tabBar,
    height: size.tabBar,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.md,
  },
});

const badgeStyles = (theme: Theme) => ({
  badge: {
    position: 'absolute' as const,
    // Half on the glyph's top-right corner, the way a sticker lands. Further
    // out it stopped belonging to the glyph and started being a third item in
    // the row.
    top: -space.xs,
    right: -space.xs,
    minWidth: size.badge,
    height: size.badge,
    paddingHorizontal: space.xs,
    borderRadius: size.badge / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.badge,
  },
  count: {
    ...type.badge,
    color: theme.color.onBadge,
  },
});
