import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';

import { size, space } from '@/lib/theme';
import { useTheme } from '@/providers/theme';

const POSITIONS = [0, 1, 2, 3, 4];

/** Rounds to the nearest half star, which is the finest difference an eye reads. */
function glyph(rating: number, position: number) {
  const filled = Math.round((rating - position) * 2) / 2;
  if (filled >= 1) return 'star';
  if (filled >= 0.5) return 'star-half-full';
  return 'star-outline';
}

export function Stars({ rating }: { rating: number }) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${rating} out of 5 stars`}
      style={{ flexDirection: 'row', gap: space.xs }}>
      {POSITIONS.map((position) => (
        <MaterialCommunityIcons
          key={position}
          name={glyph(rating, position)}
          size={size.star}
          color={theme.color.brass}
        />
      ))}
    </View>
  );
}
