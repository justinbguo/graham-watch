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
 * Profile. The wishlist is a pile of watches, so a save can land on it; Profile is
 * you, and a shop flying at it would claim it is a pile of shops.
 */
export function FollowDealer({
  dealer,
  block = false,
}: {
  dealer: { id: string; name: string; logo_url?: string | null };
  /** On a row of its own: the row's width, at the same height. */
  block?: boolean;
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
      hitSlop={(HIT_TARGET - type.body.lineHeight) / 2}
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
        block && styles.block,
        !following && styles.solid,
        pressed && styles.pressed,
      ]}>
      <GlyphTurn
        on={following}
        from="account-plus-outline"
        to="account-check-outline"
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
    // The name beside it is `body`. The line is a little taller than the
    // letters, which is the height the capsule should be.
    height: type.body.lineHeight,
    // Half the height, or the rounded end covers the word and iOS clips it.
    paddingHorizontal: type.body.lineHeight / 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.color.text,
    backgroundColor: theme.color.background,
  },
  // Full width when it has a row of its own, at the same height. A
  // `controlMin` bar was the heaviest thing on the card.
  block: {
    alignSelf: 'stretch' as const,
    justifyContent: 'center' as const,
  },
  solid: {
    backgroundColor: theme.color.text,
  },
  pressed: {
    opacity: 0.72,
  },
  label: {
    ...type.control,
    color: theme.color.text,
  },
  solidLabel: {
    color: theme.color.background,
  },
});
