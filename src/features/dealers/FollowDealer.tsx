import { Pressable, Text } from 'react-native';

import { GlyphTurn } from '@/components/GlyphTurn';
import { useFollows, useToggleFollow } from '@/data/follows';
import { logEvent } from '@/data/listingEvents';
import { requestNotificationPermission } from '@/features/onboarding/notifications';
import { isDemo } from '@/lib/demo';
import { tick } from '@/lib/haptics';
import type { BuyerEventSurface } from '@/lib/models';
import { dealerSocial, size, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

import { dealerSocialButtonStyles, dealerSocialHitSlop } from './socialButton';

/**
 * One rounded rectangle, two inks. Follow is solid `text` with the word and
 * glyph in `background` because it is the thing to do. Following is the same
 * shape turned inside out: a `text` stroke and type on the page colour,
 * because it is done. Same size, same stroke, so the press swaps the ink and
 * the button does not move.
 *
 * The answer is on the capsule you pressed: the plus turns into the check and
 * the word changes with it, on the frame the write starts. Nothing flies to
 * Profile. The wishlist is a pile of watches, so a save can land on it; Profile is
 * you, and a shop flying at it would claim it is a pile of shops.
 */
export function FollowDealer({
  dealer,
  surface,
  block = false,
  compact = false,
}: {
  dealer: { id: string; name: string; logo_url?: string | null };
  /** Where the button is, for the buyer event log. */
  surface: BuyerEventSurface;
  /** On a row of its own: the row's width, at the same height. */
  block?: boolean;
  /** Community directory. Same shape, shorter, so the shop name keeps the row. */
  compact?: boolean;
}) {
  const { userId } = useSession();
  const theme = useTheme();
  const styles = useThemedStyles(compact ? followCompactStyles : followStyles);
  const { data: follows = [], isSuccess } = useFollows(userId);
  const toggle = useToggleFollow(userId);
  const following = follows.some((shop) => shop.id === dealer.id);
  const label = following ? 'Following' : 'Follow';
  // The first follow is the moment a drop has someone to reach. Onboarding
  // already asked; this covers Not now. Cold start does not ask again.

  if (!userId) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: following }}
      hitSlop={dealerSocialHitSlop(compact ? dealerSocial.compactMinHeight : dealerSocial.minHeight)}
      onPress={() => {
        tick();
        const firstFollow = isSuccess && follows.length === 0 && !following;
        logEvent({ kind: following ? 'unfollow' : 'follow', surface, dealer });
        toggle.mutate(
          {
            id: dealer.id,
            name: dealer.name,
            logo_url: dealer.logo_url ?? null,
            following: !following,
          },
          {
            onSuccess: () => {
              if (firstFollow && !isDemo) void requestNotificationPermission();
            },
          },
        );
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
        size={compact ? size.iconSmall : size.dealerSocialMark}
        color={following ? theme.color.text : theme.color.background}
      />
      <Text style={[styles.label, !following && styles.solidLabel]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const followStyles = (theme: Theme) => dealerSocialButtonStyles(theme);
const followCompactStyles = (theme: Theme) => dealerSocialButtonStyles(theme, true);
