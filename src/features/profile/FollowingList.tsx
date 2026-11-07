import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedMark } from '@/components/VerifiedMark';
import { Message } from '@/components/ui';
import { useFollows } from '@/data/follows';
import { FollowDealer } from '@/features/dealers/FollowDealer';
import { dealerPicture } from '@/features/dealers/picture';
import { useOpenStack } from '@/lib/openStack';
import { size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

export function FollowingList() {
  const { userId } = useSession();
  const { data: follows = [], isPending } = useFollows(userId);
  const open = useOpenStack();
  const styles = useThemedStyles(listStyles);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Following</Text>
      {isPending ? null : follows.length === 0 ? (
        <Message text="Shops you follow show up here." />
      ) : (
        <View>
          {follows.map((shop) => {
            return (
              <View key={shop.id} style={styles.row}>
                {/* The follow control is its own button. A button inside the
                    row's button is invalid, and one tap would both open the
                    shop and change the follow. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${shop.name}, verified`}
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
});
