import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { size as layoutSize, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/** Gold dealer-verified badge: filled decagram and a bold white check. */
export function VerifiedMark({ px = layoutSize.icon - 2 }: { px?: number }) {
  const theme = useTheme();
  const styles = useThemedStyles(markStyles);
  const glyph = Math.round(px);
  const check = Math.max(12, Math.round(glyph * 0.58));

  return (
    <View style={[styles.badge, { width: glyph, height: glyph }]} accessible={false}>
      <MaterialCommunityIcons
        name="check-decagram"
        size={glyph}
        color={theme.color.brass}
        style={styles.glyph}
      />
      <View style={styles.checkSlot}>
        <MaterialCommunityIcons name="check-bold" size={check} color={theme.color.onBadge} />
      </View>
    </View>
  );
}

const markStyles = (_theme: Theme) => ({
  badge: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  glyph: {
    ...StyleSheet.absoluteFill,
  },
  checkSlot: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
