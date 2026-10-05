import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, View } from 'react-native';

import { HIT_TARGET, radius, size, space, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * A glyph-only control in a screen's header.
 *
 * `marked` puts the unread dot on the glyph's top-right corner — the same
 * `size.unread` brass dot a conversation row wears, because the two say the
 * same thing. A count there would turn the header into a scoreboard; the
 * number goes in `label` for the screen reader instead.
 */
export function HeaderIcon({
  label,
  name,
  marked = false,
  onPress,
}: {
  label: string;
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  marked?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(iconStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.hit}>
      <View>
        <MaterialCommunityIcons name={name} size={size.icon} color={theme.color.text} />
        {marked ? <View style={styles.dot} /> : null}
      </View>
    </Pressable>
  );
}

const iconStyles = (theme: Theme) => ({
  hit: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dot: {
    position: 'absolute' as const,
    // Half off the glyph's corner, the way the tab bar lands its count.
    top: -space.xs,
    right: -space.xs,
    width: size.unread,
    height: size.unread,
    borderRadius: radius.full,
    backgroundColor: theme.color.brass,
  },
});
