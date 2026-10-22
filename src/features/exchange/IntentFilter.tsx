import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { DeckRailButton } from '@/components/DeckRailButton';
import { intentLabel, type ExchangeIntent } from '@/data/exchange';
import { HIT_TARGET, inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { INTENTS } from './copy';

type RailIcon = keyof typeof MaterialCommunityIcons.glyphMap;

const RAIL_ICONS: Record<FeedFilter, RailIcon> = {
  all: 'view-list',
  sell: 'tag-outline',
  buy: 'cart-outline',
  trade: 'swap-horizontal',
  random: 'shuffle-variant',
};

export type FeedFilter = ExchangeIntent | 'all';

const CHOICES: { value: FeedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...INTENTS.map((intent) => ({ value: intent, label: intentLabel(intent) })),
];

/**
 * Feed intent filter. On a phone it is a row of capsules under the title. On
 * desktop web it is a left rail beside the feed.
 */
export function IntentFilter({
  value,
  onChange,
  variant = 'bar',
}: {
  value: FeedFilter;
  onChange: (next: FeedFilter) => void;
  variant?: 'bar' | 'rail';
}) {
  const bar = useThemedStyles(barStyles);
  const rail = useThemedStyles(railStyles);

  if (variant === 'rail') {
    const styles = rail;
    return (
      <View style={styles.rail}>
        {CHOICES.map((choice) => {
          const on = choice.value === value;
          return (
            <DeckRailButton
              key={choice.value}
              label={choice.label}
              icon={RAIL_ICONS[choice.value]}
              active={on}
              accessibilityLabel={choice.value === 'all' ? 'All posts' : choice.label}
              onPress={() => onChange(choice.value)}
            />
          );
        })}
      </View>
    );
  }

  const styles = bar;

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

const barStyles = (theme: Theme) => ({
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

const railStyles = (_theme: Theme) => ({
  rail: {
    alignSelf: 'stretch' as const,
    gap: space.sm,
  },
});
