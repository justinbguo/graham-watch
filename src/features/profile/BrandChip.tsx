import { Pressable, Text } from 'react-native';

import { HIT_TARGET, inset, radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** One brand from the catalogue, with how many watches it has beside the name. */
export function BrandChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(chipStyles);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
      <Text style={[styles.chipCount, selected && styles.chipLabelSelected]}>{count}</Text>
    </Pressable>
  );
}

const chipStyles = (theme: Theme) => ({
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: inset.chipX,
    paddingVertical: inset.chipY,
    minHeight: HIT_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  chipSelected: {
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
  },
  chipLabel: {
    ...type.label,
    color: theme.color.text,
  },
  chipCount: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  chipLabelSelected: {
    color: theme.color.onAccent,
  },
});
