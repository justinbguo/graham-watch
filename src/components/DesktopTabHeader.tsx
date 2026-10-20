import { useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchDoor } from '@/components/SearchBar';
import { Wordmark } from '@/components/Wordmark';
import { ProfileTabIcon } from '@/features/profile/ProfileTabIcon';
import { SaveFlightTarget } from '@/features/saved/flight';
import { useOpenStack } from '@/lib/openStack';
import { useTheme } from '@/providers/theme';
import { setSearchLaunchRect } from '@/lib/searchLaunch';
import { useDesktopContentWidth } from '@/lib/layout';
import { HIT_TARGET, layout, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

type HeaderTabModel = {
  key: string;
  label: string;
  focused: boolean;
  badge?: number;
  accessibilityLabel?: string;
  flightTarget?: boolean;
  onPress: () => void;
  onLongPress: () => void;
};

export function DesktopTabHeader({ tabs }: { tabs: HeaderTabModel[] }) {
  const styles = useThemedStyles(headerStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const columnWidth = useDesktopContentWidth();
  const open = useOpenStack();
  const searchAnchor = useRef<View>(null);
  const navTabs = tabs.filter((tab) => tab.label !== 'Profile');
  const profileTab = tabs.find((tab) => tab.label === 'Profile');

  return (
    <View
      style={[
        styles.shell,
        {
          paddingTop: insets.top + space.sm,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      <View style={styles.shellAlign}>
        <View style={[styles.column, { width: columnWidth }]}>
          <View style={styles.row}>
            <View style={styles.brand}>
              <Wordmark variant="headerText" />
            </View>
            <View style={styles.navBand}>
              <View accessibilityRole="tablist" style={styles.nav}>
                {navTabs.map((tab) => (
                  <HeaderTab key={tab.key} tab={tab} />
                ))}
              </View>
            </View>
            <View
              ref={searchAnchor}
              collapsable={false}
              style={[
                styles.search,
                { flexBasis: `${layout.desktopHeaderSearchShare * 100}%` as const },
              ]}>
              <SearchDoor
                variant="header"
                accessibilityLabel="Search brand, model or reference"
                onPress={() => {
                  searchAnchor.current?.measureInWindow((x, y, width, height) => {
                    setSearchLaunchRect({ x, y, width, height });
                    open('search', { compose: '1' }, '/search?compose=1');
                  });
                }}
              />
            </View>
            <View style={styles.profileSlot}>
              {profileTab ? (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: profileTab.focused }}
                  accessibilityLabel={profileTab.accessibilityLabel ?? 'Profile'}
                  onPress={profileTab.onPress}
                  onLongPress={profileTab.onLongPress}
                  style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
                  <ProfileTabIcon
                    color={profileTab.focused ? theme.color.accent : theme.color.text}
                    focused={profileTab.focused}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function HeaderTab({ tab }: { tab: HeaderTabModel }) {
  const styles = useThemedStyles(headerStyles);

  const control = (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: tab.focused }}
      aria-selected={tab.focused}
      accessibilityLabel={tabLabel(tab)}
      onPress={tab.onPress}
      onLongPress={tab.onLongPress}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <View style={[styles.pill, tab.focused && styles.pillActive]}>
        <Text style={[styles.pillLabel, tab.focused && styles.pillLabelActive]}>{tab.label}</Text>
        {tab.badge ? (
          <View style={[styles.badge, tab.focused && styles.badgeActive]} accessible={false}>
            <Text style={[styles.badgeCount, tab.focused && styles.badgeCountActive]} numberOfLines={1}>
              {tab.badge > 99 ? '99+' : tab.badge}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  return tab.flightTarget ? <SaveFlightTarget>{control}</SaveFlightTarget> : control;
}

function tabLabel(tab: HeaderTabModel) {
  const name = tab.accessibilityLabel ?? tab.label;
  return tab.badge ? `${name}, ${tab.badge}` : name;
}

const headerStyles = (theme: Theme) => ({
  shell: {
    width: '100%' as const,
    minHeight: layout.desktopHeader,
    backgroundColor: theme.color.background,
    borderBottomWidth: size.rule,
    borderBottomColor: theme.color.border,
    ...Platform.select({
      web: { position: 'sticky' as const, top: 0, zIndex: 10 },
      default: {},
    }),
  },
  shellAlign: {
    width: '100%' as const,
    alignItems: 'center' as const,
  },
  column: {
    width: '100%' as const,
    maxWidth: '100%' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    width: '100%' as const,
    minHeight: HIT_TARGET,
    gap: space.lg,
  },
  brand: {
    flexShrink: 0,
  },
  navBand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: space.md,
  },
  nav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.md,
    flexShrink: 0,
    ...Platform.select({
      web: { flexWrap: 'nowrap' as const },
      default: {},
    }),
  },
  search: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: layout.desktopHeaderSearchMax,
    justifyContent: 'center' as const,
  },
  profileSlot: {
    flexShrink: 0,
    width: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  profile: {
    flexShrink: 0,
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  tab: {
    minHeight: HIT_TARGET,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: size.desktopNavPill,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  pillActive: {
    backgroundColor: theme.color.accent,
  },
  pillLabel: {
    ...type.labelStrong,
    flexShrink: 0,
    color: theme.color.text,
    ...Platform.select({
      web: { whiteSpace: 'nowrap' as const },
      default: {},
    }),
  },
  pillLabelActive: {
    color: theme.color.onAccent,
  },
  badge: {
    minWidth: size.badge,
    height: size.badge,
    paddingHorizontal: space.xs,
    borderRadius: size.badge / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.badge,
  },
  badgeActive: {
    backgroundColor: theme.color.badge,
  },
  badgeCount: {
    ...type.badge,
    color: theme.color.onBadge,
  },
  badgeCountActive: {
    color: theme.color.onBadge,
  },
  pressed: {
    opacity: 0.72,
  },
});
