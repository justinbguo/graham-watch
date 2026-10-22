import { Image } from 'expo-image';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';

import { Message, Spinner } from '@/components/ui';
import {
  type ExchangeAuthor,
  type ExchangePost,
  type VoteValue,
  useCastExchangeVote,
  useExchangeFeed,
} from '@/data/exchange';
import { ActionBar, ActionPill } from '@/components/ActionBar';
import { inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { commentCount } from './copy';
import type { FeedFilter } from './IntentFilter';
import { PostHeader, PostLead } from './PostHeader';
import { PostTitle } from './PostTitle';
import { Votes } from './Votes';

export function Feed({
  filter,
  onOpen,
  onOpenAuthor,
  flush = false,
}: {
  filter: FeedFilter;
  onOpen: (id: string) => void;
  onOpenAuthor: (author: ExchangeAuthor) => void;
  /** Desktop community column: gutter comes from the shell, not the list. */
  flush?: boolean;
}) {
  const styles = useThemedStyles(feedStyles);
  const gutter = flush ? space.lg : inset.screen;
  const { data: posts = [], isPending, error } = useExchangeFeed();
  const vote = useCastExchangeVote();
  // Buying is a request, so on All it stays at the top instead of ageing out
  // of the feed. Newest first within the strip, same as the posts under it. A
  // buying post is not repeated below: the strip is where it lives. With one
  // kind chosen there is nothing to pin above, so they are cards like the rest.
  const all = filter === 'all';
  const buying = all ? posts.filter((post) => post.intent === 'buy') : [];
  const rest = all
    ? posts.filter((post) => post.intent !== 'buy')
    : posts.filter((post) => post.intent === filter);

  if (isPending) return <Spinner />;
  if (error) {
    return (
      <View style={[styles.state, { paddingHorizontal: gutter }]}>
        <Message text="The community did not load." />
      </View>
    );
  }

  const listPad = { paddingHorizontal: gutter, paddingBottom: space.xxxl };
  const pinPull = { marginHorizontal: flush ? -space.lg : -inset.screen };

  return (
    <FlatList
      data={rest}
      keyExtractor={(post) => post.id}
      contentContainerStyle={
        rest.length === 0 && buying.length === 0 ? { ...listPad, gap: space.md } : { ...listPad, gap: space.md }
      }
      ListHeaderComponent={
        buying.length ? <PinnedBuys posts={buying} onOpen={onOpen} pinPull={pinPull} /> : null
      }
      ListEmptyComponent={
        <Message
          text={
            all
              ? 'No posts yet. The first one is a public offer between two people.'
              : 'No posts of this kind yet.'
          }
        />
      }
      renderItem={({ item, index }) => (
        <PostCard
          post={item}
          first={index === 0 && buying.length === 0}
          onPress={() => onOpen(item.id)}
          onOpenAuthor={() => onOpenAuthor(item.author)}
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
  pinPull,
}: {
  posts: ExchangePost[];
  onOpen: (id: string) => void;
  pinPull: { marginHorizontal: number };
}) {
  const styles = useThemedStyles(feedStyles);

  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.pinRow}
      style={[styles.pins, pinPull]}>
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
 * A card: who is offering, the watch and its price under their name, the
 * photograph, and the row of things you can do about it. The offer opens the
 * post; the byline and the action bar do not.
 *
 * They are siblings of the pressable rather than children of it. A control
 * inside a control is a button inside a button on the web, which is invalid
 * markup, and the one tap would both vote and open the thread.
 */
function PostCard({
  post,
  first,
  onPress,
  onOpenAuthor,
  onVote,
}: {
  post: ExchangePost;
  /** The screen header already ends in air; a second gap above it doubles it. */
  first: boolean;
  onPress: () => void;
  onOpenAuthor: () => void;
  onVote: (value: VoteValue) => void;
}) {
  const styles = useThemedStyles(feedStyles);

  return (
    <View style={[styles.card, first && styles.cardFirst]}>
      <PostLead>
        <PostHeader author={post.author} at={post.created_at} onPress={onOpenAuthor} />
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.open}>
          <PostTitle title={post.title} post={post} />
          {post.cover_url ? (
            <Image
              source={{ uri: post.cover_url }}
              style={styles.cover}
              contentFit="cover"
              accessible={false}
            />
          ) : null}
          <Text style={styles.body} numberOfLines={2}>
            {post.body}
          </Text>
        </Pressable>
      </PostLead>
      <ActionBar>
        <Votes score={post.vote_count} mine={post.my_vote} onVote={onVote} />
        <ActionPill
          mark={require('../../../assets/comment.svg')}
          label={commentCount(post.comment_count)}
          text={String(post.comment_count)}
          onPress={onPress}
        />
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
    marginBottom: space.lg,
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
    ...type.label,
    color: theme.color.textMuted,
  },
  pinTitle: {
    ...type.bodyStrong,
    color: theme.color.text,
  },
  // `space.lg` above and below each post, `space.md` between the lead, the
  // photograph and the text, and the action row. The byline-to-title gap
  // lives on `PostLead`, not here, so it does not also pull the action row up.
  card: {
    paddingVertical: space.lg,
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  cardFirst: {
    paddingTop: 0,
  },
  open: {
    gap: space.md,
  },
  // Wider than tall. A square as wide as the card made every post a poster,
  // and the name under the username had already said what the watch was.
  cover: {
    width: '100%' as const,
    aspectRatio: 3 / 2,
    borderRadius: radius.lg,
    overflow: 'hidden' as const,
    backgroundColor: theme.color.surfaceSunken,
  },
  // Same size as the title. Weight on the title is the difference.
  body: {
    ...type.body,
    color: theme.color.text,
  },
});
