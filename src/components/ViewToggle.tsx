import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, View } from 'react-native';

import { HIT_TARGET, size, type Theme } from '@/lib/theme';
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
            style={styles.option}>
            <MaterialCommunityIcons
              name={option.icon}
              size={size.icon}
              color={isActive ? theme.color.brass : theme.color.textFaint}
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
  },
  option: {
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
