import { Pressable, Text, View } from 'react-native';

import { intentLabel, type ExchangeIntent } from '@/data/exchange';
import { HIT_TARGET, inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { INTENTS } from './copy';

export type FeedFilter = ExchangeIntent | 'all';

const CHOICES: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...INTENTS.map((intent) => ({ value: intent, label: intentLabel(intent) })),
];

/**
 * One row of capsules under the title: All, then each kind of post. One is
 * always on. The chosen one is `brass` with `background` type; the rest sit
 * on `fill`, the same shape, so choosing swaps the ink and nothing moves.
 *
 * They share the row in equal widths instead of scrolling. Five fit across a
 * phone, and a row with a half-hidden last word reads as cut off.
 */
export function IntentFilter({
  value,
  onChange,
}: {
  value: FeedFilter;
  onChange: (next: FeedFilter) => void;
}) {
  const styles = useThemedStyles(filterStyles);

  return (
    <View style={styles.row}>
      {CHOICES.map((choice) => {
        const on = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={choice.value === 'all' ? 'All posts' : choice.label}
            hitSlop={{ top: (HIT_TARGET - size.follow) / 2, bottom: (HIT_TARGET - size.follow) / 2 }}
            onPress={() => onChange(choice.value)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const filterStyles = (theme: Theme) => ({
  // Sits in the screen's subhead, which already spaces it from the title and
  // from the feed. This row only insets to the same gutter as the title.
  row: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: inset.screen,
  },
  chip: {
    flex: 1,
    height: size.follow,
    paddingHorizontal: space.xs,
    borderRadius: radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.color.fill,
  },
  chipOn: {
    backgroundColor: theme.color.brass,
  },
  label: {
    ...type.control,
    color: theme.color.ink,
  },
  labelOn: {
    color: theme.color.background,
  },
  pressed: {
    opacity: 0.72,
  },
});
