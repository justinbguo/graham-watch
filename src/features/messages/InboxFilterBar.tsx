import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { DeckRailButton } from '@/components/DeckRailButton';
import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { InboxFilter } from './inboxFilter';

type RailIcon = keyof typeof MaterialCommunityIcons.glyphMap;

const FILTERS: { id: InboxFilter; label: string; icon: RailIcon }[] = [
  { id: 'all', label: 'All', icon: 'email-multiple-outline' },
  { id: 'unread', label: 'Unread', icon: 'email-mark-as-unread' },
  { id: 'favorites', label: 'Favorites', icon: 'star-outline' },
  { id: 'groups', label: 'Groups', icon: 'account-group-outline' },
];

export function InboxFilterBar({
  value,
  onChange,
  variant = 'bar',
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
  variant?: 'bar' | 'rail';
}) {
  const styles = useThemedStyles(barStyles);

  if (variant === 'rail') {
    return (
      <View style={styles.rail}>
        {FILTERS.map((filter) => (
          <DeckRailButton
            key={filter.id}
            label={filter.label}
            icon={filter.icon}
            active={value === filter.id}
            onPress={() => onChange(filter.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {FILTERS.map((filter) => {
        const selected = value === filter.id;
        return (
          <Pressable
            key={filter.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(filter.id)}
            style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
            <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const barStyles = (theme: Theme) => ({
  rail: {
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.xs,
  },
  chip: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
  },
  chipOn: {
    backgroundColor: theme.color.surface,
  },
  label: {
    ...type.control,
    color: theme.color.textMuted,
  },
  labelOn: {
    color: theme.color.text,
    fontFamily: type.labelStrong.fontFamily,
  },
  pressed: {
    opacity: 0.72,
  },
});
