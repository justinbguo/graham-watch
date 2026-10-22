import { Pressable, Text, View } from 'react-native';

import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { HubSectionId } from './HubSection';

const TABS: { id: HubSectionId; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'payments', label: 'Payments' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'listings', label: 'Listings' },
  { id: 'support', label: 'Support' },
];

export function HubTabBar({
  value,
  onChange,
  messagesUnread,
}: {
  value: HubSectionId;
  onChange: (next: HubSectionId) => void;
  messagesUnread: boolean;
}) {
  const styles = useThemedStyles(tabStyles);

  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {TABS.map((tab) => {
        const selected = value === tab.id;
        const showDot = tab.id === 'messages' && messagesUnread;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              showDot ? `${tab.label}, unread messages` : tab.label
            }
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.pressed,
            ]}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
                {tab.label}
              </Text>
              {showDot ? <View style={styles.dot} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: space.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabSelected: {
    borderBottomColor: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
  labelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    maxWidth: '100%' as const,
  },
  label: {
    ...type.label,
    color: theme.color.textMuted,
  },
  labelSelected: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.color.badge,
  },
});
