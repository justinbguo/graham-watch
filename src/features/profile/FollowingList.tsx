import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedMark } from '@/components/VerifiedMark';
import { Message } from '@/components/ui';
import { useDropCounts } from '@/data/drops';
import { useFollows } from '@/data/follows';
import { FollowDealer } from '@/features/dealers/FollowDealer';
import { dealerPicture } from '@/features/dealers/picture';
import { useOpenStack } from '@/lib/openStack';
import { HIT_TARGET, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

export function FollowingList() {
  const { userId } = useSession();
  const { data: follows = [], isPending } = useFollows(userId);
  const { data: drops = [] } = useDropCounts(userId);
  const unseenByDealer = new Map(drops.map((row) => [row.dealerId, row.unseen]));
  const unseen = drops.reduce((sum, row) => sum + row.unseen, 0);
  const open = useOpenStack();
  const styles = useThemedStyles(listStyles);

  return (
    <View style={styles.section}>
      {unseen > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`New from dealers you follow, ${unseen}`}
          onPress={() => open('drops', undefined, '/drops')}
          style={({ pressed }) => [styles.fresh, pressed && styles.pressed]}>
          <Text style={styles.freshTitle}>New from dealers you follow</Text>
          <Text style={styles.freshCount}>{unseen}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.heading}>Following</Text>
      {isPending ? null : follows.length === 0 ? (
        <Message text="Shops you follow show up here." />
      ) : (
        <View>
          {follows.map((shop) => {
            const fresh = unseenByDealer.get(shop.id) ?? 0;
            return (
              <View key={shop.id} style={styles.row}>
                {/* The follow control is its own button. A button inside the
                    row's button is invalid, and one tap would both open the
                    shop and change the follow. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    fresh > 0 ? `${shop.name}, ${fresh} new, verified` : `${shop.name}, verified`
                  }
                  onPress={() =>
                    open('dealer/[dealerId]', { dealerId: shop.id }, `/dealer/${shop.id}`)
                  }
                  style={({ pressed }) => [styles.open, pressed && styles.pressed]}>
                  <Avatar
                    url={shop.logo_url}
                    px={size.icon}
                    fit="contain"
                    fallback={dealerPicture}
                  />
                  <Text style={styles.name} numberOfLines={1}>
                    {shop.name}
                  </Text>
                  {fresh > 0 ? <Text style={styles.freshCount}>{fresh} new</Text> : null}
                  <VerifiedMark />
                </Pressable>
                {/* The capsule aligns itself to the start of its own box. The row
                    centres this box, so the button sits on the name's line. */}
                <View>
                  <FollowDealer dealer={shop} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const listStyles = (theme: Theme) => ({
  section: {
    gap: stack.related,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  open: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  name: {
    ...type.bodyStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
  fresh: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    minHeight: HIT_TARGET,
  },
  freshTitle: {
    ...type.title,
    color: theme.color.text,
    flex: 1,
  },
  freshCount: {
    ...type.caption,
    color: theme.color.textMuted,
  },
});
