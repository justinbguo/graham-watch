import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, View } from 'react-native';

import { radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export type DeckView = 'cards' | 'grid';

const OPTIONS: { value: DeckView; icon: 'cards-outline' | 'view-grid-outline'; label: string }[] = [
  { value: 'cards', icon: 'cards-outline', label: 'One at a time' },
  { value: 'grid', icon: 'view-grid-outline', label: 'Grid' },
];

export function ViewToggle({
  value,
  onChange,
}: {
  value: DeckView;
  onChange: (next: DeckView) => void;
}) {
  const styles = useThemedStyles(toggleStyles);
  const theme = useTheme();

  return (
    <View style={styles.group}>
      {OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(option.value)}
            style={[styles.option, isActive && styles.optionActive]}>
            <MaterialCommunityIcons
              name={option.icon}
              size={size.tabIcon}
              color={isActive ? theme.color.text : theme.color.textFaint}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const toggleStyles = (theme: Theme) => ({
  group: {
    flexDirection: 'row' as const,
    backgroundColor: theme.color.surfaceSunken,
    borderRadius: radius.pill,
    padding: space.xs,
  },
  option: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  optionActive: {
    backgroundColor: theme.color.surface,
  },
});
