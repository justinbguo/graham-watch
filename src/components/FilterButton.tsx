import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { HIT_TARGET, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const MARK = require('../../assets/filter.svg');

/**
 * Three centred bars, long to short, from `assets/filter.svg`. One drawing: `text`
 * until a filter is on, then `brass`, same as any other active control. The
 * file's stroke is black, so `tintColor` is what keeps it visible on a dark
 * page. The count is the whole point: without it a user who filtered on
 * another screen has no way to tell why the deck looks short.
 */
export function FilterButton({
  count,
  onPress,
  variant = 'icon',
}: {
  count: number;
  onPress: () => void;
  variant?: 'icon' | 'text';
}) {
  const styles = useThemedStyles(buttonStyles);
  const theme = useTheme();
  const isActive = count > 0;

  if (variant === 'text') {
    const label = isActive ? `Filter · ${count}` : 'Filter';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count ? `Filters, ${count} active` : 'Filters'}
        onPress={onPress}
        style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
        <View style={styles.textRow}>
          <Image
            source={MARK}
            style={styles.mark}
            contentFit="contain"
            tintColor={isActive ? theme.color.brass : theme.color.text}
            accessible={false}
          />
          <Text style={[styles.textLabel, isActive && styles.textLabelActive]}>{label}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Filters, ${count} active` : 'Filters'}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Image
        source={MARK}
        style={styles.mark}
        contentFit="contain"
        tintColor={isActive ? theme.color.brass : theme.color.text}
        accessible={false}
      />
      {isActive ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

const buttonStyles = (theme: Theme) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xs,
    minWidth: HIT_TARGET,
    minHeight: HIT_TARGET,
  },
  mark: {
    width: size.icon,
    height: size.icon,
  },
  pressed: {
    opacity: 0.72,
  },
  count: {
    ...type.control,
    color: theme.color.brass,
  },
  textButton: {
    alignSelf: 'flex-start' as const,
    minHeight: size.desktopNavPill,
    paddingHorizontal: space.md,
    justifyContent: 'center' as const,
  },
  textRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  textLabel: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  textLabelActive: {
    color: theme.color.brass,
  },
});
