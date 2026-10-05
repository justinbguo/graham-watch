import { Pressable } from 'react-native';

import { GlyphTurn } from '@/components/GlyphTurn';
import { HIT_TARGET, size, type Theme } from '@/lib/theme';
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
}: {
  value: DeckView;
  onChange: (next: DeckView) => void;
}) {
  const styles = useThemedStyles(toggleStyles);
  const theme = useTheme();
  const showsGrid = value === 'cards';

  return (
    <Pressable
      accessibilityRole="button"
      // The label is the destination, so it stays true as the glyph turns.
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

const toggleStyles = (_theme: Theme) => ({
  button: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
