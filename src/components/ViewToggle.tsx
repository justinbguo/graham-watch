import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { GlyphTurn } from '@/components/GlyphTurn';
import { HIT_TARGET, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

export type DeckView = 'cards' | 'grid';

/**
 * One button, showing where the tap goes rather than where you are: on cards it
 * offers the grid, on the grid it offers cards. Two glyphs side by side meant
 * one of them was always the answer to a question nobody asked, and a lit one
 * beside a faint one is a segmented control drawn without its frame.
 */
export function ViewToggle({
  value,
  onChange,
  variant = 'icon',
}: {
  value: DeckView;
  onChange: (next: DeckView) => void;
  variant?: 'icon' | 'text';
}) {
  const styles = useThemedStyles(toggleStyles);
  const theme = useTheme();
  const showsGrid = value === 'cards';
  const destination = showsGrid ? 'Grid View' : 'Card View';

  if (variant === 'text') {
    const icon = showsGrid ? 'view-grid-outline' : 'cards-outline';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showsGrid ? 'Switch to grid view' : 'Switch to card view'}
        onPress={() => onChange(showsGrid ? 'grid' : 'cards')}
        style={styles.textButton}>
        <View style={styles.textRow}>
          <MaterialCommunityIcons name={icon} size={size.icon} color={theme.color.text} />
          <Text style={styles.textLabel}>{destination}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showsGrid ? 'Grid' : 'One at a time'}
      onPress={() => onChange(showsGrid ? 'grid' : 'cards')}
      style={styles.button}>
      <GlyphTurn
        on={!showsGrid}
        from="view-grid-outline"
        to="cards-outline"
        size={size.icon}
        color={theme.color.text}
      />
    </Pressable>
  );
}

const toggleStyles = (theme: Theme) => ({
  button: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
});
