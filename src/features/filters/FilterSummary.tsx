import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { inset, motion, radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { FilterChip } from './chips';

export function FilterSummary({
  matched,
  chips,
  onClear,
}: {
  matched?: number;
  chips: FilterChip[];
  onClear: () => void;
}) {
  const styles = useThemedStyles(summaryStyles);
  const count =
    matched == null ? null : `${matched} watch${matched === 1 ? '' : 'es'}`;

  return (
    <View style={styles.summary}>
      <View style={styles.head}>
        <Text style={styles.count}>{count ?? ' '}</Text>
        {chips.length ? (
          <Pressable accessibilityRole="button" onPress={onClear} hitSlop={space.sm}>
            <Text style={styles.clear}>Clear all</Text>
          </Pressable>
        ) : null}
      </View>
      {chips.length ? (
        <Animated.View layout={LinearTransition.duration(motion.smooth)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {chips.map((chip) => (
              <Animated.View
                key={chip.key}
                entering={FadeIn.duration(motion.smooth)}
                exiting={FadeOut.duration(motion.fast)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${chip.label}`}
                  onPress={chip.remove}
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <Text style={styles.chipLabel} numberOfLines={1}>
                    {chip.label}
                  </Text>
                  <Text style={styles.chipClose}>×</Text>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

const summaryStyles = (theme: Theme) => ({
  summary: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  count: {
    ...type.titleSmall,
    color: theme.color.text,
  },
  clear: {
    ...type.control,
    color: theme.color.danger,
  },
  chips: {
    gap: space.sm,
    paddingRight: inset.screen,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    maxWidth: 220,
    paddingVertical: space.xs,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.color.fill,
  },
  chipLabel: {
    ...type.control,
    color: theme.color.ink,
    flexShrink: 1,
  },
  chipClose: {
    ...type.control,
    color: theme.color.inkMuted,
  },
  pressed: {
    opacity: 0.72,
  },
});
