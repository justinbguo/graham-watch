import { FlatList, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Message, Spinner } from '@/components/ui';
import { useCollectorPosts, type ExchangeAuthor } from '@/data/exchange';
import { MessagePerson } from '@/features/messages/MessagePerson';
import { inset, size, space, stack, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { PostRow } from './PostRow';

/**
 * One person, as the board can see them. The screen title is already their
 * name, so the row under it is the face, the username, and the collector
 * number, and Message when this is someone else. Under that, the posts they
 * have written. The wishlist and the settings stay on the Profile tab, because
 * those belong to the signed-in account and this page is someone else's.
 */
export function Collector({
  author,
  onOpenPost,
}: {
  author: ExchangeAuthor;
  onOpenPost: (id: string) => void;
}) {
  const styles = useThemedStyles(collectorStyles);
  const { userId } = useSession();
  const { data: posts = [], isPending, error } = useCollectorPosts(author.id);
  const name = author.name ?? (author.handle ? `@${author.handle}` : 'this person');

  return (
    <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.identity}>
            <Avatar url={author.avatar_url} px={size.profile} />
            <View style={styles.copy}>
              {author.handle ? <Text style={styles.handle}>@{author.handle}</Text> : null}
              {author.number ? (
                <Text style={styles.number}>{`Collector #${author.number}`}</Text>
              ) : null}
            </View>
            {author.id && author.id !== userId ? (
              <MessagePerson userId={author.id} name={name} />
            ) : null}
          </View>
          <Text style={styles.heading}>Posts</Text>
          {isPending ? <Spinner /> : null}
          {error ? <Message text="Their posts did not load." tone="error" /> : null}
          {!isPending && !error && posts.length === 0 ? <Message text="No posts yet." /> : null}
        </View>
      }
      renderItem={({ item }) => <PostRow post={item} onPress={() => onOpenPost(item.id)} />}
    />
  );
}

const collectorStyles = (theme: Theme) => ({
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  header: {
    gap: stack.section,
    paddingBottom: space.md,
  },
  identity: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingVertical: space.md,
  },
  copy: {
    flex: 1,
    gap: stack.tight,
  },
  handle: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  number: {
    ...type.caption,
    color: theme.color.brass,
  },
  heading: {
    ...type.title,
    color: theme.color.text,
  },
});
