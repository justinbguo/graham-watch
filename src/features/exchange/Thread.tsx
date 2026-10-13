import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { ActionBar, ActionPill } from '@/components/ActionBar';
import { SendBar } from '@/components/SendBar';
import { Message, Spinner } from '@/components/ui';
import {
  useCastExchangeVote,
  useCreateExchangeComment,
  useDeleteExchangePost,
  useExchangePost,
  type ExchangeComment,
} from '@/data/exchange';
import { MessagePerson } from '@/features/messages/MessagePerson';
import { useKeyboardLift } from '@/lib/keyboard';
import { inset, size, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { atHandle } from './copy';
import { PostHeader, PostLead } from './PostHeader';
import { PostMenu } from './PostMenu';
import { PostPhotos } from './PostPhotos';
import { PostTitle } from './PostTitle';
import { Votes } from './Votes';

/** Who a comment is addressed to, while it is being written. */
type ReplyTarget = { id: string; handle: string | null };

/** `@handle ` at the front of a draft. A trailing space so the next word is theirs. */
function mention(handle: string | null) {
  const at = atHandle(handle);
  return at ? `${at} ` : '';
}

export function Thread({
  userId,
  postId,
  onEdit,
  onDeleted,
  onOpenAuthor,
}: {
  userId: string;
  postId: string;
  onEdit: () => void;
  onDeleted: () => void;
  onOpenAuthor: (author: ExchangeComment['author']) => void;
}) {
  const styles = useThemedStyles(threadStyles);
  const lift = useKeyboardLift(true);
  const { data, isPending, error } = useExchangePost(postId);
  const comment = useCreateExchangeComment(userId, postId);
  const remove = useDeleteExchangePost();
  const vote = useCastExchangeVote();
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  if (isPending) return <Spinner />;
  if (error) return <Message text="This post did not load." />;
  if (!data?.post) return <Message text="This post is gone." />;

  const post = data.post;
  const photos = data.photos;
  const mine = post.author_id === userId;

  function reply(item: ExchangeComment) {
    const next = mention(item.author.handle);
    const previous = mention(replyTo?.handle ?? null);
    setDraft((current) => {
      const rest = previous && current.startsWith(previous) ? current.slice(previous.length) : current;
      if (!next || rest.startsWith(next)) return rest;
      return `${next}${rest}`;
    });
    setReplyTo({ id: item.id, handle: item.author.handle });
  }

  function send() {
    const body = draft.trim();
    if (!body || comment.isPending) return;
    void comment
      .mutateAsync({ body, parentId: replyTo?.id ?? null })
      .then(() => {
        setDraft('');
        setReplyTo(null);
      })
      .catch(() => {});
  }

  function confirmDelete() {
    Alert.alert('Delete this post?', 'The comments go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void remove
            .mutateAsync({ postId, paths: photos.map((photo) => photo.path) })
            .then(onDeleted)
            .catch(() => {});
        },
      },
    ]);
  }

  return (
    // The composer sits on the keyboard's top edge, not behind it: a field you
    // cannot see while typing into it is the one control on the screen.
    <View style={[styles.fill, { paddingBottom: lift }]}>
      <FlatList
        data={data.comments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.post}>
            <PostLead>
              <PostHeader
                author={data.author}
                at={post.created_at}
                onPress={() => onOpenAuthor(data.author)}
                trailing={mine ? <PostMenu onEdit={onEdit} onDelete={confirmDelete} /> : undefined}
              />
              <PostTitle title={post.title} post={post} />
            </PostLead>
            <PostPhotos urls={photos.map((photo) => photo.url)} />
            <Text style={styles.body}>{post.body}</Text>
            <ActionBar>
              <Votes
                score={data.vote_count}
                mine={data.my_vote}
                onVote={(value) => vote.mutate({ postId, value })}
              />
              {mine ? null : (
                <MessagePerson
                  userId={data.author.id}
                  name={atHandle(data.author.handle) ?? 'this person'}
                />
              )}
            </ActionBar>
            {remove.isPending ? <Message text="Deleting…" /> : null}
            {remove.error ? <Message text="That post did not delete." tone="error" /> : null}
          </View>
        }
        ListEmptyComponent={<Message text="No comments yet." />}
        renderItem={({ item }) => (
          <Comment
            comment={item}
            mine={item.author.id === userId}
            onVote={(value) => vote.mutate({ postId, commentId: item.id, value })}
            onOpenAuthor={() => onOpenAuthor(item.author)}
            onReply={() => reply(item)}
          />
        )}
      />
      <SendBar
        placeholder={replyTo ? `Reply to ${atHandle(replyTo.handle) ?? 'them'}` : 'Write a comment'}
        value={draft}
        onChangeText={setDraft}
        onSend={send}
        busy={comment.isPending}
        note={
          <>
            {replyTo ? (
              <ReplyingTo name={atHandle(replyTo.handle) ?? 'them'} onCancel={() => setReplyTo(null)} />
            ) : null}
            {comment.error ? <Message text="That comment did not post." tone="error" /> : null}
          </>
        }
      />
    </View>
  );
}

/**
 * A comment, and under it the two things you can do about it: vote, or answer
 * the person who wrote it. A reply is indented to the width of an avatar, so
 * it starts under the name it is answering.
 */
function Comment({
  comment,
  mine,
  onVote,
  onReply,
  onOpenAuthor,
}: {
  comment: ExchangeComment;
  mine: boolean;
  onVote: (value: 1 | 0 | -1) => void;
  onReply: () => void;
  onOpenAuthor: () => void;
}) {
  const styles = useThemedStyles(threadStyles);
  const name = atHandle(comment.author.handle) ?? 'this person';

  return (
    <View style={[styles.comment, comment.parent_id ? styles.reply : null]}>
      <PostHeader author={comment.author} at={comment.created_at} onPress={onOpenAuthor} />
      <Text style={styles.commentBody}>{comment.body}</Text>
      <ActionBar>
        <Votes score={comment.vote_count} mine={comment.my_vote} onVote={onVote} />
        <ActionPill
          icon="reply-outline"
          label={`Reply to ${name}`}
          text="Reply"
          onPress={onReply}
        />
        {mine ? null : <MessagePerson userId={comment.author.id} name={name} />}
      </ActionBar>
    </View>
  );
}

/** What the composer is pointed at, and the way back out of it. */
function ReplyingTo({ name, onCancel }: { name: string; onCancel: () => void }) {
  const styles = useThemedStyles(threadStyles);
  return (
    <View style={styles.replyingTo}>
      <Text style={styles.replyingLabel} numberOfLines={1}>
        {`Replying to ${name}`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stop replying"
        hitSlop={space.sm}
        onPress={onCancel}
        style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.replyLabel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const threadStyles = (theme: Theme) => ({
  fill: { flex: 1 },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.lg,
    gap: space.md,
  },
  post: {
    gap: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  body: {
    ...type.body,
    color: theme.color.text,
  },
  commentBody: {
    ...type.body,
    color: theme.color.text,
  },
  comment: {
    gap: space.sm,
    paddingTop: space.md,
  },
  // An answer starts where the name it answers starts: one avatar in.
  reply: {
    paddingLeft: size.avatarByline + space.sm,
  },
  replyLabel: {
    ...type.control,
    color: theme.color.textMuted,
  },
  replyingTo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.md,
  },
  replyingLabel: {
    ...type.caption,
    color: theme.color.textMuted,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
