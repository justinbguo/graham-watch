import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Divider, Eyebrow, Field, Message } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';
import { inset, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import type { SourcingReply, SourcingRequest } from './types';

function ReplyRow({ reply }: { reply: SourcingReply }) {
  const styles = useThemedStyles(threadStyles);

  return (
    <View style={styles.reply}>
      <Text style={styles.replyAuthor}>{reply.authorName}</Text>
      <Text style={styles.replyBody}>{reply.body}</Text>
      <Text style={styles.meta}>{formatRelativeTime(reply.createdAt)}</Text>
    </View>
  );
}

export function RequestThread({
  request,
  onToggleLooking,
  onReply,
  lookingBusy,
  replyBusy,
  replyError,
}: {
  request: SourcingRequest;
  onToggleLooking: () => void;
  onReply: (body: string) => void;
  lookingBusy: boolean;
  replyBusy: boolean;
  replyError?: string;
}) {
  const styles = useThemedStyles(threadStyles);
  const [draft, setDraft] = useState('');
  const detail = [request.reference, request.budget].filter(Boolean).join(' · ');
  const lookingLabel = request.lookingByMe ? "You're looking too" : "I'm looking too";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={request.replies}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={
          <View style={styles.original}>
            <Eyebrow>{request.brand}</Eyebrow>
            <Text style={styles.model}>{request.model}</Text>
            {detail ? <Text style={styles.detail}>{detail}</Text> : null}
            <Text style={styles.meta}>
              {request.authorName} · {formatRelativeTime(request.createdAt)}
            </Text>
            {request.body ? <Text style={styles.body}>{request.body}</Text> : null}
            <Button
              label={lookingLabel}
              variant={request.lookingByMe ? 'secondary' : 'primary'}
              loading={lookingBusy}
              onPress={onToggleLooking}
            />
            <Text style={styles.lookingCount}>
              {request.lookingCount === 1
                ? '1 person is looking'
                : `${request.lookingCount} people are looking`}
            </Text>
            <Text style={styles.repliesHeading}>
              {request.replies.length === 0
                ? 'No replies yet'
                : request.replies.length === 1
                  ? '1 reply'
                  : `${request.replies.length} replies`}
            </Text>
          </View>
        }
        renderItem={({ item }) => <ReplyRow reply={item} />}
        ListEmptyComponent={null}
      />

      <View style={styles.composer}>
        <Field
          placeholder="Share a lead or a question"
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="sentences"
          returnKeyType="send"
          onSubmitEditing={() => {
            if (!draft.trim()) return;
            onReply(draft);
            setDraft('');
          }}
        />
        {replyError ? <Message text={replyError} tone="error" /> : null}
        <Button
          label="Reply"
          loading={replyBusy}
          disabled={!draft.trim()}
          onPress={() => {
            onReply(draft);
            setDraft('');
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const threadStyles = (theme: Theme) => ({
  screen: {
    flex: 1,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xl,
  },
  original: {
    gap: stack.tight,
    paddingBottom: space.xl,
  },
  model: {
    ...type.title,
    color: theme.color.text,
  },
  detail: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  meta: {
    ...type.caption,
    color: theme.color.textFaint,
  },
  body: {
    ...type.body,
    color: theme.color.textMuted,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  lookingCount: {
    ...type.caption,
    color: theme.color.brass,
    paddingBottom: space.lg,
  },
  repliesHeading: {
    ...type.eyebrow,
    color: theme.color.textMuted,
    paddingTop: space.md,
  },
  reply: {
    paddingVertical: space.lg,
    gap: stack.tight,
  },
  replyAuthor: {
    ...type.labelStrong,
    color: theme.color.text,
  },
  replyBody: {
    ...type.body,
    color: theme.color.textMuted,
  },
  composer: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: inset.screen,
    gap: stack.related,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
});
