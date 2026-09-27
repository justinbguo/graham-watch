import { Image } from 'expo-image';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Message, Spinner } from '@/components/ui';
import {
  intentLabel,
  type ExchangeIntent,
  type ExchangePost,
  type VoteValue,
  useCastExchangeVote,
  useExchangeFeed,
} from '@/data/exchange';
import { ActionBar, ActionPill } from '@/components/ActionBar';
import { MessagePerson } from '@/features/messages/MessagePerson';
import { inset, radius, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { authorLine, commentCount, priceLine } from './copy';
import { IntentChips } from './IntentChips';
import { PostHeader } from './PostHeader';
import { Tag } from './Tag';
import { Votes } from './Votes';

export function Feed({
  userId,
  intent,
  onIntent,
  onOpen,
}: {
  userId: string;
  intent: ExchangeIntent | null;
  onIntent: (intent: ExchangeIntent | null) => void;
  onOpen: (id: string) => void;
}) {
  const styles = useThemedStyles(feedStyles);
  const { data: posts = [], isPending, error } = useExchangeFeed();
  const vote = useCastExchangeVote();
  const shown = intent ? posts.filter((post) => post.intent === intent) : posts;

  if (isPending) return <Spinner />;
  if (error) {
    return (
      <View style={styles.state}>
        <Message text="The exchange did not load." />
      </View>
    );
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={(post) => post.id}
      contentContainerStyle={shown.length === 0 ? styles.empty : styles.list}
      ListHeaderComponent={
        <View style={styles.chips}>
          <IntentChips value={intent} onChange={onIntent} />
        </View>
      }
      ListEmptyComponent={
        <Message
          text={
            intent
              ? `No ${intentLabel(intent).toLowerCase()} posts yet.`
              : 'No posts yet. The first one is a public offer between two people.'
          }
        />
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
        <Text style={styles.title} numberOfLines={3}>
          {post.title}
        </Text>
        <View style={styles.flair}>
          <Tag label={intentLabel(post.intent)} />
          <Tag label={priceLine(post)} />
        </View>
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
  chips: {
    marginBottom: space.md,
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
  title: {
    ...type.titleSmall,
    color: theme.color.text,
  },
  // Under the title, not beside it: the two facts that decide whether the
  // post is for you, in the order a listing states them.
  flair: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
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
