import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Eyebrow, Message } from '@/components/ui';
import { useFollows } from '@/data/follows';
import { useOpenStack } from '@/lib/openStack';
import { radius, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

export function FollowingList() {
  const { userId } = useSession();
  const { data: follows = [], isPending } = useFollows(userId);
  const open = useOpenStack();
  const styles = useThemedStyles(listStyles);

  return (
    <View style={styles.section}>
      <Eyebrow>Following</Eyebrow>
      {isPending ? null : follows.length === 0 ? (
        <Message text="Shops you follow show up here." />
      ) : (
        <View>
          {follows.map((shop) => (
            <Pressable
              key={shop.id}
              accessibilityRole="button"
              accessibilityLabel={shop.name}
              onPress={() =>
                open('dealer/[dealerId]', { dealerId: shop.id }, `/dealer/${shop.id}`)
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              {shop.logo_url ? (
                <Image
                  source={{ uri: shop.logo_url }}
                  style={styles.mark}
                  contentFit="contain"
                  accessible={false}
                />
              ) : null}
              <Text style={styles.name}>{shop.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const listStyles = (theme: Theme) => ({
  section: {
    gap: stack.related,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  pressed: {
    opacity: 0.72,
  },
  mark: {
    width: size.icon,
    height: size.icon,
    borderRadius: radius.sm,
  },
  name: {
    ...type.bodyStrong,
    color: theme.color.text,
    flexShrink: 1,
  },
});
