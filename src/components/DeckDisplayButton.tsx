import { Pressable, Text, View } from 'react-native';

import { DECK_DENSITY_MAX, DECK_DENSITY_MIN } from '@/lib/gridColumns';
import { size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

/**
 * Listings per row on the desktop Buy rail. Same row as Rewind and Filter:
 * the count sits where their glyph does, and the word is Display. A press
 * steps the count by one and wraps after the widest grid. One is the card
 * deck; two and up is the grid.
 */
export function DeckDisplayButton({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const styles = useThemedStyles(displayStyles);
  const next = value >= DECK_DENSITY_MAX ? DECK_DENSITY_MIN : value + 1;
  const spoken = value === 1 ? 'Display, one at a time' : `Display, ${value} per row`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => onChange(next)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={styles.count}>
          <Text style={styles.label}>{value}</Text>
        </View>
        <Text style={styles.label}>Display</Text>
      </View>
    </Pressable>
  );
}

const displayStyles = (theme: Theme) => ({
  button: {
    alignSelf: 'flex-start' as const,
    minHeight: size.desktopNavPill,
    paddingHorizontal: space.md,
    justifyContent: 'center' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  count: {
    width: size.icon,
    height: size.icon,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  label: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
});
