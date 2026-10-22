import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, Text, View } from 'react-native';

import { Message, Spinner } from '@/components/ui';
import { useCollectorPosts } from '@/data/exchange';
import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { PostRow } from '@/features/exchange/PostRow';
import { size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useTheme, useThemedStyles } from '@/providers/theme';

/**
 * The signed-in person's posts, in the same row the community profile uses.
 * They sit in the profile's list rather than a list of their own: a vertical
 * list inside that one would take the scroll.
 */
export function Posts({
  onOpen,
  onCreate,
}: {
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { userId } = useSession();
  const { data: posts = [], isPending, error } = useCollectorPosts(userId);
  const styles = useThemedStyles(postStyles);
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Posts</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create one"
          hitSlop={dealerSocialHitSlop()}
          onPress={onCreate}
          style={({ pressed }) => [styles.create, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="plus" size={size.icon} color={theme.color.text} />
          <Text style={styles.createLabel} numberOfLines={1}>Create one</Text>
        </Pressable>
      </View>
      {isPending ? <Spinner /> : null}
      {error ? <Message text="Your posts did not load." tone="error" /> : null}
      {!isPending && !error && posts.length === 0 ? (
        <Message text="No posts yet." tone="muted" />
      ) : null}
      {posts.map((post) => (
        <PostRow key={post.id} post={post} onPress={() => onOpen(post.id)} />
      ))}
    </View>
  );
}

const postStyles = (theme: Theme) => {
  const social = dealerSocialButtonStyles(theme);
  return {
    section: {
      gap: stack.related,
    },
    headerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: space.sm,
    },
    heading: {
      ...type.title,
      color: theme.color.text,
      flex: 1,
      minWidth: 0,
    },
    create: social.button,
    createLabel: social.label,
    pressed: social.pressed,
  };
};
