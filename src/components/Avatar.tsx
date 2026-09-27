import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { radius, size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * A square photograph of whoever, or whatever, is being named — a person on
 * the exchange, a shop in a conversation, you on your profile.
 *
 * Square with a small radius, not a circle: the app's photographs are all
 * rectangles, and one round one in a column of them reads as a different kind
 * of thing. The glyph is the empty state, in place of initials, so a person
 * with no photograph looks the same everywhere.
 */
export function Avatar({
  url,
  px = size.avatar,
  glyph = 'account-outline',
}: {
  url: string | null;
  px?: number;
  glyph?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const styles = useThemedStyles(avatarStyles);
  const theme = useTheme();
  const box = { width: px, height: px };

  if (url) {
    return (
      <Image source={{ uri: url }} style={[styles.photo, box]} contentFit="cover" accessible={false} />
    );
  }

  return (
    <View style={[styles.photo, styles.empty, box]}>
      <MaterialCommunityIcons
        name={glyph}
        // Half the box, so the glyph reads as a mark inside a frame rather
        // than a picture that happens to be a glyph.
        size={Math.round(px / 2)}
        color={theme.color.textMuted}
      />
    </View>
  );
}

const avatarStyles = (theme: Theme) => ({
  photo: {
    borderRadius: radius.sm,
    backgroundColor: theme.color.surfaceSunken,
  },
  empty: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
