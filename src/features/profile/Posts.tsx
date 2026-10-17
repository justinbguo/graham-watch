import { Pressable, Text, View } from 'react-native';

import { Message, Spinner } from '@/components/ui';
import { useCollectorPosts } from '@/data/exchange';
import { dealerSocialButtonStyles, dealerSocialHitSlop } from '@/features/dealers/socialButton';
import { PostRow } from '@/features/exchange/PostRow';
import { space, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

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

  return (
    <View>
      <Text style={styles.heading}>Posts</Text>
      {isPending ? <Spinner /> : null}
      {error ? <Message text="Your posts did not load." tone="error" /> : null}
      {!isPending && !error && posts.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create one"
          hitSlop={dealerSocialHitSlop()}
          onPress={onCreate}
          style={({ pressed }) => [styles.create, pressed && styles.pressed]}>
          <Text style={styles.createLabel}>Create one</Text>
        </Pressable>
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
    heading: {
      ...type.title,
      color: theme.color.text,
      marginBottom: space.md,
    },
    create: {
      ...social.button,
      minHeight: 30,
      paddingHorizontal: space.md,
    },
    createLabel: social.label,
    pressed: social.pressed,
  };
};
