import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { avatarUrl } from '@/lib/avatarUrl';
import { radius, size, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * A square photograph of whoever, or whatever, is being named — a person on
 * the exchange, a shop in a conversation, you on your profile.
 *
 * Square with a small radius, not a circle: the app's photographs are all
 * rectangles, and one round one in a column of them reads as a different kind
 * of thing. The glyph is the empty state for a person, in place of initials.
 * A shop passes `fallback` instead: a picture, not a symbol.
 */
export function Avatar({
  url,
  px = size.avatar,
  glyph = 'account-outline',
  fit = 'cover',
  fallback,
}: {
  url: string | null;
  px?: number;
  glyph?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** `contain` keeps a logo whole. `cover` crops a photograph to the square. */
  fit?: 'cover' | 'contain';
  /** Shown when `url` is missing or fails. A shop's default picture. */
  fallback?: ImageSource;
}) {
  const styles = useThemedStyles(avatarStyles);
  const theme = useTheme();
  const box = { width: px, height: px };
  const source = avatarUrl(url);
  // The url that failed, not a boolean: a recycled row must not keep the last
  // shop's miss.
  const [broken, setBroken] = useState<string | null>(null);

  if (source && broken !== source) {
    return (
      <Image
        source={{ uri: source }}
        style={[styles.photo, box]}
        contentFit={fit}
        onError={() => setBroken(source)}
        accessible={false}
      />
    );
  }

  if (fallback) {
    return (
      <Image
        source={fallback}
        style={[styles.photo, box]}
        contentFit="cover"
        accessible={false}
      />
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
