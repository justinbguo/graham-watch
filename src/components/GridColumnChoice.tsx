import { Pressable, Text, View } from 'react-native';

import { GRID_COLUMN_OPTIONS, type GridColumnOption } from '@/lib/gridColumns';
import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function GridColumnChoice({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: GridColumnOption) => void;
}) {
  const styles = useThemedStyles(choiceStyles);
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel="Listings per row">
      <Text style={styles.caption}>Per row</Text>
      {GRID_COLUMN_OPTIONS.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={`${option} listings per row`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[styles.option, selected && styles.optionSelected]}>
            <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const choiceStyles = (theme: Theme) => ({
  group: {
    alignSelf: 'stretch' as const,
    paddingLeft: space.lg,
    gap: space.xs,
  },
  caption: {
    ...type.caption,
    color: theme.color.textMuted,
    paddingHorizontal: space.md,
  },
  option: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  optionSelected: {
    backgroundColor: theme.color.surface,
  },
  optionLabel: {
    ...type.labelStrong,
    color: theme.color.textMuted,
  },
  optionLabelSelected: {
    color: theme.color.text,
  },
});
