import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { intentLabel, type ExchangeIntent } from '@/data/exchange';
import { HIT_TARGET, inset, radius, size, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { INTENT_OPTIONS } from './copy';

/**
 * Selling, buying, trading, or random, as one field. A row each spent the top
 * of the form on one small choice. It opens in place: a menu floating over the
 * title would need a border, and this app does not outline a control.
 */
export function IntentSelect({
  value,
  onChange,
}: {
  value: ExchangeIntent;
  onChange: (intent: ExchangeIntent) => void;
}) {
  const styles = useThemedStyles(selectStyles);
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = intentLabel(value);

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${current}. What this post is.`}
        onPress={() => setOpen((was) => !was)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.value}>{current}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={size.icon}
          color={theme.color.ink}
        />
      </Pressable>
      {open
        ? INTENT_OPTIONS.map((option) => {
            const selected = option.intent === value;
            return (
              <Pressable
                key={option.intent}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(option.intent);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                <Text style={[styles.optionLabel, selected && styles.optionOn]}>{option.label}</Text>
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

const selectStyles = (theme: Theme) => ({
  block: {
    backgroundColor: theme.color.fill,
    borderRadius: radius.md,
    overflow: 'hidden' as const,
  },
  trigger: {
    height: size.controlMin,
    paddingHorizontal: inset.controlX,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  pressed: {
    opacity: 0.72,
  },
  // The same face a field uses, line height left off for the same reason:
  // iOS applies it as a baseline offset and the letters sit low in the box.
  value: {
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    color: theme.color.ink,
  },
  option: {
    minHeight: HIT_TARGET,
    paddingHorizontal: inset.controlX,
    justifyContent: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  optionLabel: {
    ...type.labelStrong,
    color: theme.color.ink,
  },
  optionOn: {
    color: theme.color.brass,
  },
});
