import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import { SearchField } from '@/components/SearchBar';
import { Centered, Heading, Message, Spinner } from '@/components/ui';
import {
  BODY_SEARCH_MIN,
  useConversations,
  useMessageByHandle,
  useMessagesMatching,
} from '@/data/messages';
import { useOpenStack } from '@/lib/openStack';
import { inset, space, type Theme } from '@/lib/theme';
import { normalizeUsername, usernameIsValid } from '@/lib/username';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from './ConversationRow';
import { MessageHandle } from './MessageHandle';
import { hasHandle, visibleConversations } from './match';

/** Each letter is not a search. Older lines are asked once typing pauses. */
const BODY_SEARCH_PAUSE = 300;

/**
 * Every thread you are in, newest movement first. The body only: the
 * Messages tab owns the header.
 *
 * The field filters that list, and a finished username offers a new thread.
 * A prefix does not look people up — only a complete handle does, and only
 * that one account.
 */
export function ConversationList({ userId }: { userId: string }) {
  const styles = useThemedStyles(listStyles);
  const open = useOpenStack();
  const { data: conversations = [], isPending, error } = useConversations(userId);
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const term = query.trim();
  const debounced = useDebounced(term, BODY_SEARCH_PAUSE);
  const bodies = useMessagesMatching(debounced);
  const start = useMessageByHandle();

  const handle = normalizeUsername(term);
  const canMessage = !isPending && usernameIsValid(term) && !hasHandle(conversations, handle);
  const bodyIds = new Set(debounced === term ? (bodies.data ?? []) : []);
  const shown = visibleConversations(conversations, term, bodyIds);
  const bodyFailed = debounced === term && term.length >= BODY_SEARCH_MIN && bodies.isError;

  function sendToHandle() {
    if (!canMessage || start.isPending) return;
    start.mutate(handle, {
      onSuccess: (conversationId) => {
        setQuery('');
        setFailure(null);
        open(
          'conversation/[conversationId]',
          { conversationId },
          `/conversation/${conversationId}`,
        );
      },
      onError: (err) => setFailure(said(err)),
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.query}>
        <SearchField
          accessibilityLabel="Search messages or a username"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setFailure(null);
          }}
          onSubmitEditing={sendToHandle}
          autoComplete="off"
        />
      </View>
      {failure ? (
        <View style={styles.note}>
          <Message text={failure} tone="error" />
        </View>
      ) : null}
      {bodyFailed ? (
        <View style={styles.note}>
          <Message text="Older messages did not search." tone="error" />
        </View>
      ) : null}
      {canMessage ? (
        <View style={styles.compose}>
          <MessageHandle handle={handle} busy={start.isPending} onPress={sendToHandle} />
        </View>
      ) : null}
      {isPending ? (
        <Spinner />
      ) : error ? (
        <View style={styles.note}>
          <Message text="Your messages did not load." tone="error" />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(conversation) => conversation.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={shown.length === 0 && !canMessage ? styles.empty : styles.list}
          ListEmptyComponent={
            canMessage ? null : term ? (
              <Centered>
                <Message text="No messages match." />
              </Centered>
            ) : (
              <Centered>
                <Heading>No messages yet</Heading>
                <Message text="Search a username above, ask a shop about a watch, or write from a post." />
              </Centered>
            )
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() =>
                open(
                  'conversation/[conversationId]',
                  { conversationId: item.id },
                  `/conversation/${item.id}`,
                )
              }
            />
          )}
        />
      )}
    </View>
  );
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function said(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('yours')) return 'That username is yours.';
  if (message.includes('not valid')) return 'That username is not valid.';
  if (message.includes('No one has')) return 'No one has that username.';
  if (message.includes('sign in') || message.includes('signed-in')) return 'Sign in to send a message.';
  return 'Could not open that conversation.';
}

const listStyles = (_theme: Theme) => ({
  root: {
    flex: 1,
  },
  query: {
    // The header leaves space.lg under every title. This field is that title's
    // own control, so it sits space.sm under "Messages".
    marginTop: space.sm - space.lg,
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
  },
  compose: {
    paddingHorizontal: inset.screen,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  empty: {
    paddingHorizontal: inset.screen,
    flexGrow: 1,
  },
  note: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.sm,
  },
});
