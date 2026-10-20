import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text } from 'react-native';

import { HIT_TARGET, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** "Save to profile" checkbox row under an address or payment block. */
export function SaveToggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(toggleStyles);
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <MaterialCommunityIcons
        name={value ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={size.icon}
        color={value ? theme.color.text : theme.color.textMuted}
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const toggleStyles = (theme: Theme) => ({
  row: {
    minHeight: HIT_TARGET,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.body,
    color: theme.color.text,
    flex: 1,
  },
});
