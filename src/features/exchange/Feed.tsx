import { Image } from 'expo-image';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';

import { Message, Spinner } from '@/components/ui';
import {
  type ExchangePost,
  type VoteValue,
  useCastExchangeVote,
  useExchangeFeed,
} from '@/data/exchange';
import { ActionBar, ActionPill } from '@/components/ActionBar';
import { MessagePerson } from '@/features/messages/MessagePerson';
import { inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { authorLine, commentCount } from './copy';
import { PostHeader } from './PostHeader';
import { PostTitle } from './PostTitle';
import { Votes } from './Votes';

export function Feed({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(feedStyles);
  const { data: posts = [], isPending, error } = useExchangeFeed();
  const vote = useCastExchangeVote();
  // Buying is a request, so it stays at the top instead of ageing out of the
  // feed. Newest first within the strip, same as the posts under it. A buying
  // post is not repeated below: the strip is where it lives.
  const buying = posts.filter((post) => post.intent === 'buy');
  const rest = posts.filter((post) => post.intent !== 'buy');

  if (isPending) return <Spinner />;
  if (error) {
    return (
      <View style={styles.state}>
        <Message text="The community did not load." />
      </View>
    );
  }

  return (
    <FlatList
      data={rest}
      keyExtractor={(post) => post.id}
      contentContainerStyle={rest.length === 0 && buying.length === 0 ? styles.empty : styles.list}
      ListHeaderComponent={buying.length ? <PinnedBuys posts={buying} onOpen={onOpen} /> : null}
      ListEmptyComponent={
        <Message text="No posts yet. The first one is a public offer between two people." />
      }
      renderItem={({ item }) => (
        <PostCard
          post={item}
          mine={item.author.id === userId}
          onPress={() => onOpen(item.id)}
          onVote={(value) => vote.mutate({ postId: item.id, value })}
        />
      )}
    />
  );
}

/**
 * Buying posts, as a row of title cards. A horizontal list inside the feed's
 * list warns and steals the vertical scroll, so this is a plain scroller.
 */
function PinnedBuys({
  posts,
  onOpen,
}: {
  posts: ExchangePost[];
  onOpen: (id: string) => void;
}) {
  const styles = useThemedStyles(feedStyles);

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.pinRow}
      style={styles.pins}>
      {posts.map((post) => (
        <Pressable
          key={post.id}
          accessibilityRole="button"
          accessibilityLabel={`${post.title}, buying`}
          onPress={() => onOpen(post.id)}
          style={styles.pin}>
          <Text style={styles.pinKicker}>Buying</Text>
          <Text style={styles.pinTitle} numberOfLines={3}>
            {post.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/**
 * A card: who is offering, what it is, the photograph, and the row of things
 * you can do about it. The offer opens the post; the byline and the action
 * bar do not.
 *
 * They are siblings of the pressable rather than children of it. A control
 * inside a control is a button inside a button on the web, which is invalid
 * markup, and the one tap would both vote and open the thread.
 */
function PostCard({
  post,
  mine,
  onPress,
  onVote,
}: {
  post: ExchangePost;
  mine: boolean;
  onPress: () => void;
  onVote: (value: VoteValue) => void;
}) {
  const styles = useThemedStyles(feedStyles);

  return (
    <View style={styles.card}>
      <PostHeader author={post.author} at={post.created_at} />
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.open}>
        <PostTitle title={post.title} post={post} lines={3} />
        {post.cover_url ? (
          <Image
            source={{ uri: post.cover_url }}
            style={styles.cover}
            contentFit="cover"
            accessible={false}
          />
        ) : null}
        <Text style={styles.body} numberOfLines={3}>
          {post.body}
        </Text>
      </Pressable>
      <ActionBar>
        <Votes score={post.vote_count} mine={post.my_vote} onVote={onVote} />
        <ActionPill
          icon="comment-outline"
          label={commentCount(post.comment_count)}
          text={String(post.comment_count)}
          onPress={onPress}
        />
        {mine ? null : (
          <MessagePerson
            userId={post.author.id}
            name={authorLine(post.author.handle, post.author.number)}
          />
        )}
      </ActionBar>
    </View>
  );
}

const feedStyles = (theme: Theme) => ({
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  empty: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
    gap: space.md,
  },
  state: {
    paddingHorizontal: inset.screen,
  },
  // The feed is already inset. Pulling the strip back out lets the next card
  // scroll to the screen edge while the first one stays on the gutter.
  pins: {
    marginHorizontal: -inset.screen,
    marginBottom: space.md,
  },
  pinRow: {
    paddingHorizontal: inset.screen,
    gap: space.sm,
  },
  pin: {
    width: size.pinned,
    minHeight: size.gridPhoto,
    padding: space.md,
    gap: space.xs,
    borderRadius: radius.md,
    backgroundColor: theme.color.surface,
    justifyContent: 'center' as const,
  },
  pinKicker: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  pinTitle: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  card: {
    paddingVertical: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  open: {
    gap: space.sm,
  },
  // Square, and as wide as the card. A 180pt letterbox made every watch a
  // thumbnail beside its own description; the photograph is the offer.
  cover: {
    width: '100%' as const,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
  },
  body: {
    ...type.body,
    color: theme.color.text,
  },
});
