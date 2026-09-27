import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { radius, size, space, type, type Theme } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * The row of capsules under a post: vote, answer, write to them. Everything
 * you can do about a post is in one place at its foot, rather than scattered
 * through the lines above it — the post is then read top to bottom and acted
 * on at the end.
 */
export function ActionBar({ children }: PropsWithChildren) {
  const styles = useThemedStyles(barStyles);
  return <View style={styles.bar}>{children}</View>;
}

/** One capsule: a glyph, and beside it a count or a word when there is one. */
export function ActionPill({
  icon,
  label,
  text,
  onPress,
  busy = false,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
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
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <MaterialCommunityIcons name={icon} size={size.icon} color={theme.color.textMuted} />
      )}
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </Pressable>
  );
}

export const barStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    marginTop: space.sm,
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
    color: theme.color.textMuted,
  },
  pressed: {
    opacity: 0.6,
  },
});
