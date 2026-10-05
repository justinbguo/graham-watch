import { Pressable, Text } from 'react-native';

import { GlyphTurn } from '@/components/GlyphTurn';
import { useFollows, useToggleFollow } from '@/data/follows';
import { tick } from '@/lib/haptics';
import { HIT_TARGET, radius, size, space, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * One capsule, two inks. Follow is solid `text` with the word and glyph in
 * `background` — white with black type on a dark page — because it is the
 * thing to do. Following is the same shape turned inside out: a `text`
 * stroke and type on the page colour, because it is done. Same size, same
 * stroke, so the press swaps the ink and the capsule does not move.
 *
 * The answer is on the capsule you pressed: the plus turns into the check and
 * the word changes with it, on the frame the write starts. Nothing flies to
 * Profile. Saved is a pile of watches, so a save can land on it; Profile is
 * you, and a shop flying at it would claim it is a pile of shops.
 */
export function FollowDealer({
  dealer,
}: {
  dealer: { id: string; name: string; logo_url?: string | null };
}) {
  const { userId } = useSession();
  const theme = useTheme();
  const styles = useThemedStyles(followStyles);
  const { data: follows = [] } = useFollows(userId);
  const toggle = useToggleFollow(userId);
  const following = follows.some((shop) => shop.id === dealer.id);
  const label = following ? 'Following' : 'Follow';

  if (!userId) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: following }}
      hitSlop={(HIT_TARGET - size.avatarSmall) / 2}
      onPress={() => {
        tick();
        toggle.mutate({
          id: dealer.id,
          name: dealer.name,
          logo_url: dealer.logo_url ?? null,
          following: !following,
        });
      }}
      style={({ pressed }) => [
        styles.button,
        !following && styles.solid,
        pressed && styles.pressed,
      ]}>
      <GlyphTurn
        on={following}
        from="account-plus"
        to="account-check"
        size={size.iconSmall}
        color={following ? theme.color.text : theme.color.background}
      />
      <Text style={[styles.label, !following && styles.solidLabel]}>{label}</Text>
    </Pressable>
  );
}

const followStyles = (theme: Theme) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.xs,
    height: size.avatarSmall,
    // Half the height, or the rounded end covers the word and iOS clips it.
    paddingHorizontal: size.avatarSmall / 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.text,
    backgroundColor: theme.color.background,
  },
  solid: {
    backgroundColor: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  solidLabel: {
    color: theme.color.background,
  },
});
