import { Pressable, Text, View } from 'react-native';

import type { ExchangeIntent } from '@/data/exchange';
import { HIT_TARGET, radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { INTENT_OPTIONS } from './copy';

/** A filter. Tap the lit chip again to show every post. */
export function IntentChips({
  value,
  onChange,
}: {
  value: ExchangeIntent | null;
  onChange: (intent: ExchangeIntent | null) => void;
}) {
  const styles = useThemedStyles(chipStyles);
  return (
    <View style={styles.row}>
      {INTENT_OPTIONS.map((option) => {
        const selected = value === option.intent;
        return (
          <Pressable
            key={option.intent}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : option.intent)}
            style={[styles.chip, selected && styles.chipOn]}>
            <Text style={[styles.label, selected && styles.labelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  chip: {
    minHeight: HIT_TARGET,
    paddingHorizontal: space.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.full,
    backgroundColor: theme.color.fill,
  },
  chipOn: {
    backgroundColor: theme.color.accent,
  },
  label: {
    ...type.label,
    color: theme.color.ink,
  },
  labelOn: {
    color: theme.color.onAccent,
  },
});
