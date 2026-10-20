import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DesktopTabHeader } from '@/components/DesktopTabHeader';
import { LiquidGlass } from '@/components/LiquidGlass';
import { deckContentWidth, useIsDesktopWeb, useIsWide } from '@/lib/layout';
import {
  barChrome,
  layout,
  motion,
  radius,
  shadow,
  size,
  space,
  type,
  type Theme,
  type ThemeColors,
} from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export type Tab = {
  key: string;
  label: string;
  focused: boolean;
  badge?: number;
  accessibilityLabel?: string;
  /** Save-flight lands on the Wishlist control. */
  flightTarget?: boolean;
  renderIcon: (color: string) => ReactNode;
  onPress: () => void;
  onLongPress: () => void;
};

const PRESS_SCALE = 0.92;
const PRESS_DURATION = 90;
/** Icon slots in the bottom dock — tighter than `flex: 1` across the full bar. */
const TAB_SLOT = size.tabBar - space.md;

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const isDesktopWeb = useIsDesktopWeb();
  const isWide = useIsWide();

  const tabs: Tab[] = state.routes.flatMap((route, index) => {
    const { options } = descriptors[route.key];
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
      flightTarget: route.name === 'saved',
      renderIcon: (color) => options.tabBarIcon?.({ focused, color, size: size.tabIcon }) ?? null,
      onPress: () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (focused || event.defaultPrevented) return;
        if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
        navigation.navigate(route.name, route.params);
      },
      onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
    };
  });

  if (isDesktopWeb) return <DesktopTabHeader tabs={tabs} />;
  return isWide ? <Rail tabs={tabs} /> : <Bar tabs={tabs} />;
}

function Bar({ tabs }: { tabs: Tab[] }) {
  const styles = useThemedStyles(barStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const dockWidth = deckContentWidth(windowWidth, insets.left, insets.right);

  return (
    <View
      style={[
        styles.shell,
        {
          paddingBottom: Math.max(insets.bottom, space.sm),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      <LiquidGlass tint={barChrome.blurTint} style={[styles.dock, { width: dockWidth }]}>
        <View accessibilityRole="tablist" style={styles.row}>
          {tabs.map((tab) => (
            <BarTab key={tab.key} tab={tab} />
          ))}
        </View>
      </LiquidGlass>
    </View>
  );
}

function TabGlyph({
  focused,
  color,
  renderIcon,
  wellStyle,
  glyphStyle,
  iconLayerStyle,
  children,
}: {
  focused: boolean;
  color: ThemeColors;
  renderIcon: (color: string) => ReactNode;
  wellStyle: ViewStyle;
  glyphStyle: ViewStyle;
  iconLayerStyle: ViewStyle;
  children?: ReactNode;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: motion.smooth });
  }, [focused, progress]);

  const wellAnim = useAnimatedStyle(() => ({ opacity: progress.value }));
  const idleAnim = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const activeAnim = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View style={glyphStyle}>
      <Animated.View style={[wellStyle, wellAnim]} pointerEvents="none" />
      <Animated.View style={[iconLayerStyle, idleAnim]} pointerEvents="none">
        {renderIcon(color.onBar)}
      </Animated.View>
      <Animated.View style={[iconLayerStyle, activeAnim]} pointerEvents="none">
        {renderIcon(color.onBarActive)}
      </Animated.View>
      {children}
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
      aria-selected={tab.focused}
      accessibilityLabel={tabLabel(tab)}
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      onPressIn={press.down}
      onPressOut={press.up}
      style={styles.tab}>
      <Animated.View style={[styles.tabInner, press.style]}>
        <TabGlyph
          focused={tab.focused}
          color={theme.color}
          renderIcon={tab.renderIcon}
          wellStyle={styles.well}
          glyphStyle={styles.glyph}
          iconLayerStyle={styles.iconLayer}>
          <Badge count={tab.badge} />
        </TabGlyph>
      </Animated.View>
    </Pressable>
  );
}

function Rail({ tabs }: { tabs: Tab[] }) {
  const styles = useThemedStyles(railStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.shell,
        {
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space.lg,
          paddingLeft: insets.left + space.sm,
        },
      ]}>
      <LiquidGlass tint={barChrome.blurTint} style={styles.dock}>
        <View accessibilityRole="tablist" style={styles.stack}>
          {tabs.map((tab) => (
            <RailTab key={tab.key} tab={tab} />
          ))}
        </View>
      </LiquidGlass>
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
      <Animated.View style={[styles.tabInner, press.style]}>
        <TabGlyph
          focused={tab.focused}
          color={theme.color}
          renderIcon={tab.renderIcon}
          wellStyle={styles.well}
          glyphStyle={styles.glyph}
          iconLayerStyle={styles.iconLayer}>
          <Badge count={tab.badge} />
        </TabGlyph>
      </Animated.View>
    </Pressable>
  );
}

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
  shell: {
    alignItems: 'center' as const,
    paddingTop: space.sm,
    backgroundColor: 'transparent',
  },
  dock: {
    borderRadius: radius.full,
    height: size.tabBar,
    boxShadow: shadow.card,
  },
  row: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.sm,
    height: size.tabBar,
    paddingHorizontal: space.sm,
  },
  tab: {
    width: TAB_SLOT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'stretch' as const,
  },
  tabInner: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  glyph: {
    width: size.tabIcon,
    height: size.tabIcon,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  well: {
    position: 'absolute' as const,
    width: size.tabIcon + space.md,
    height: size.tabIcon + space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.color.glassWell,
  },
});

const railStyles = (theme: Theme) => ({
  shell: {
    width: layout.rail,
    alignItems: 'center' as const,
    backgroundColor: 'transparent',
  },
  dock: {
    borderRadius: radius.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    boxShadow: shadow.card,
  },
  stack: {
    alignItems: 'center' as const,
    gap: space.xs,
  },
  tab: {
    width: size.tabBar,
    height: size.tabBar,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  tabInner: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  glyph: {
    width: size.tabIcon,
    height: size.tabIcon,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  well: {
    position: 'absolute' as const,
    width: size.tabIcon + space.lg,
    height: size.tabIcon + space.lg,
    borderRadius: radius.md,
    backgroundColor: theme.color.glassWell,
  },
});

const badgeStyles = (theme: Theme) => ({
  badge: {
    position: 'absolute' as const,
    top: -size.badge / 3,
    right: -size.badge / 3,
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
