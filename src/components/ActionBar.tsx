import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image, type ImageSource } from 'expo-image';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { HIT_TARGET, radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * The row of capsules under a post: vote and answer. Everything
 * you can do about a post is in one place at its foot, rather than scattered
 * through the lines above it — the post is then read top to bottom and acted
 * on at the end.
 */
export function ActionBar({ children }: PropsWithChildren) {
  const styles = useThemedStyles(barStyles);
  return <View style={styles.bar}>{children}</View>;
}

/**
 * A capsule is `size.iconSmall` plus `space.xs` above and below. The slop
 * makes up the rest of `HIT_TARGET` so a compact pill is still a thumb wide.
 */
export const PILL_HIT_SLOP = (HIT_TARGET - size.iconSmall - space.xs * 2) / 2;

/** One capsule: a glyph, and beside it a count or a word when there is one. */
export function ActionPill({
  icon,
  mark,
  label,
  text,
  onPress,
  busy = false,
}: {
  /** A MaterialCommunityIcons glyph. A commissioned drawing uses `mark`. */
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** An SVG asset. The file's stroke is black; `ink` tints it onto the pill. */
  mark?: ImageSource;
  /** Spoken, since the glyph on its own carries no word. */
  label: string;
  text?: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const styles = useThemedStyles(barStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      hitSlop={PILL_HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : mark ? (
        <Image
          source={mark}
          style={styles.mark}
          contentFit="contain"
          tintColor={theme.color.ink}
          accessible={false}
        />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={size.iconSmall} color={theme.color.ink} />
      ) : null}
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </Pressable>
  );
}

export const barStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.xs,
  },
  pill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
    // Filled, not outlined: a row of outlines reads as a row of empty boxes,
    // and the app keeps depth in the step between surfaces.
    backgroundColor: theme.color.fill,
  },
  text: {
    ...type.control,
    color: theme.color.ink,
  },
  mark: {
    width: size.iconSmall,
    height: size.iconSmall,
  },
  pressed: {
    opacity: 0.6,
  },
});
