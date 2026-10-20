import { Pressable, Text, View } from 'react-native';

import { radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/** A short, exclusive choice in one pill row: appearance, offer expiry, carrier. */
export function SegmentedChoice<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** Read by screen readers as the group's name. */
  label?: string;
}) {
  const styles = useThemedStyles(segmentedStyles);
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentActive]}>
            <Text
              style={[styles.segmentLabel, selected && styles.segmentLabelActive]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segmentedStyles = (theme: Theme) => ({
  segmented: {
    flexDirection: 'row' as const,
    backgroundColor: theme.color.fill,
    borderRadius: radius.full,
    padding: space.xs,
    gap: space.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.full,
  },
  segmentActive: {
    backgroundColor: theme.color.surface,
  },
  segmentLabel: {
    ...type.label,
    color: theme.color.textMuted,
  },
  segmentLabelActive: {
    color: theme.color.text,
  },
});
