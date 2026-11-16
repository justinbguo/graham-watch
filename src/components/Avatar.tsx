import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, type ImageSource } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { avatarUrl } from '@/lib/avatarUrl';
import { avatarMonogramColor } from '@/lib/avatarMonogram';
import { radius, size, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

const personPortrait: ImageSource = require('../../assets/paul-graham.jpg');

/**
 * A shop passes `fallback`. A group passes `monogram` or `glyph`. A person
 * with no photograph, or one that fails to load, gets the bundled portrait.
 */
export function Avatar({
  url,
  px = size.avatar,
  glyph,
  fit = 'cover',
  fallback,
  monogram,
  missing = 'portrait',
}: {
  url: string | null;
  px?: number;
  glyph?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** `contain` keeps a logo whole. `cover` crops a photograph to the square. */
  fit?: 'cover' | 'contain';
  /** Shown when `url` is missing or fails. A shop's default picture. */
  fallback?: ImageSource;
  /** A group letter on a seed-stable fill. */
  monogram?: { letter: string; seed: string };
  /**
   * `hide` draws nothing when the picture is missing or fails. The default
   * portrait is a person, and it must not stand in for a shop on a photograph.
   */
  missing?: 'portrait' | 'hide';
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

  if (monogram) {
    return (
      <View
        style={[
          styles.photo,
          styles.monogram,
          box,
          { backgroundColor: avatarMonogramColor(monogram.seed, theme.scheme) },
        ]}>
        <Text style={[styles.monogramLetter, { fontSize: Math.round(px * 0.42) }]}>
          {monogram.letter}
        </Text>
      </View>
    );
  }

  if (glyph) {
    return (
      <View style={[styles.photo, styles.empty, box]}>
        <MaterialCommunityIcons
          name={glyph}
          size={Math.round(px / 2)}
          color={theme.color.textMuted}
        />
      </View>
    );
  }

  if (missing === 'hide') return null;

  return (
    <Image
      source={personPortrait}
      style={[styles.photo, box]}
      contentFit="cover"
      accessible={false}
    />
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
  monogram: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  monogramLetter: {
    ...type.labelStrong,
    color: theme.color.text,
  },
});
