import { useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { SearchField, searchFieldInset } from '@/components/SearchBar';
import { Centered, Heading, Message, Spinner } from '@/components/ui';
import {
  BODY_SEARCH_MIN,
  useConversations,
  useMessageByHandle,
  useMessagesMatching,
  type ConversationSummary,
} from '@/data/messages';
import { useFollows } from '@/data/follows';
import { inset, space, type Theme } from '@/lib/theme';
import { normalizeUsername, usernameIsValid } from '@/lib/username';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from './ConversationRow';
import { InboxFilterBar } from './InboxFilterBar';
import { inboxFilterEmptyMessage, passesInboxFilter, type InboxFilter } from './inboxFilter';
import { MessageHandle } from './MessageHandle';
import { hasHandle, visibleConversations } from './match';
import { useOpenParty } from './openParty';
import { useDebounced } from './useDebounced';
import { useOpenConversation } from './useOpenConversation';

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
export function ConversationList({
  userId,
  threadFilter,
  embedded = false,
  toolbarTrailing,
  selectedConversationId = null,
  desktopInbox = false,
  hideInboxFilterBar = false,
  inboxFilter: inboxFilterProp,
  onInboxFilterChange,
}: {
  userId: string;
  threadFilter?: (conversation: ConversationSummary) => boolean;
  /** Seller Hub: no extra gutters; search sits under text tabs. */
  embedded?: boolean;
  /** e.g. Seller Hub "New" pill beside search */
  toolbarTrailing?: ReactNode;
  /** Desktop split: highlight the open thread. */
  selectedConversationId?: string | null;
  /** Desktop split: full-bleed rows and search under the tab header. */
  desktopInbox?: boolean;
  /** When filters live in the desktop tool rail. */
  hideInboxFilterBar?: boolean;
  inboxFilter?: InboxFilter;
  onInboxFilterChange?: (next: InboxFilter) => void;
}) {
  const styles = useThemedStyles(listStyles);
  const openConversation = useOpenConversation();
  const openParty = useOpenParty();
  const { data: conversations = [], isPending, error } = useConversations(userId);
  const { data: follows = [] } = useFollows(userId);
  const followedDealerIds = new Set(follows.map((shop) => shop.id));
  const [internalInboxFilter, setInternalInboxFilter] = useState<InboxFilter>('all');
  const inboxFilter = inboxFilterProp ?? internalInboxFilter;
  const setInboxFilter = onInboxFilterChange ?? setInternalInboxFilter;
  const baseThreads = threadFilter ? conversations.filter(threadFilter) : conversations;
  const threads = baseThreads.filter((conversation) =>
    passesInboxFilter(conversation, inboxFilter, followedDealerIds),
  );
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const term = query.trim();
  const debounced = useDebounced(term, BODY_SEARCH_PAUSE);
  const bodies = useMessagesMatching(debounced);
  const start = useMessageByHandle();

  const handle = normalizeUsername(term);
  const canMessage = !isPending && usernameIsValid(term) && !hasHandle(threads, handle);
  const bodyIds = new Set(debounced === term ? (bodies.data ?? []) : []);
  const shown = visibleConversations(threads, term, bodyIds);
  const bodyFailed = debounced === term && term.length >= BODY_SEARCH_MIN && bodies.isError;

  function sendToHandle() {
    if (!canMessage || start.isPending) return;
    start.mutate(handle, {
      onSuccess: (conversationId) => {
        setQuery('');
        setFailure(null);
        openConversation({ conversationId });
      },
      onError: (err) => setFailure(said(err)),
    });
  }

  const layout = desktopInbox
    ? desktopInboxLayout
    : embedded
      ? embeddedLayout
      : screenLayout;

  return (
    <View style={styles.root}>
      <View style={[styles.searchBlock, layout.searchBlock, desktopInbox && styles.inboxSearchBlock]}>
        <View
          style={[
            styles.query,
            layout.query,
            (embedded && toolbarTrailing) || desktopInbox ? styles.toolbar : undefined,
          ]}>
          <SearchField
            accessibilityLabel="Search messages"
            placeholder="Search"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setFailure(null);
            }}
            onSubmitEditing={sendToHandle}
            autoComplete="off"
            compact={embedded || desktopInbox}
            inbox={embedded || desktopInbox}
            style={embedded || desktopInbox ? styles.searchInToolbar : undefined}
          />
          {toolbarTrailing ?? null}
        </View>
        {!hideInboxFilterBar ? (
          <View style={[styles.filters, layout.filters]}>
            <InboxFilterBar value={inboxFilter} onChange={setInboxFilter} />
          </View>
        ) : null}
      </View>
      {failure ? (
        <View style={[styles.note, layout.note]}>
          <Message text={failure} tone="error" />
        </View>
      ) : null}
      {bodyFailed ? (
        <View style={[styles.note, layout.note]}>
          <Message text="Older messages did not search." tone="error" />
        </View>
      ) : null}
      {canMessage ? (
        <View style={[styles.compose, layout.compose]}>
          <MessageHandle
            handle={handle}
            busy={start.isPending}
            desktop={desktopInbox}
            onPress={sendToHandle}
          />
        </View>
      ) : null}
      {isPending ? (
        <Spinner />
      ) : error ? (
        <View style={[styles.note, layout.note]}>
          <Message text="Your messages did not load." tone="error" />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(conversation) => conversation.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            shown.length === 0 && !canMessage
              ? [styles.empty, layout.list]
              : [styles.list, layout.list]
          }
          ListEmptyComponent={
            canMessage ? null : term || inboxFilter !== 'all' ? (
              <Centered>
                <Message
                  text={term ? 'No messages match.' : inboxFilterEmptyMessage(inboxFilter)}
                />
              </Centered>
            ) : (
              <Centered>
                <Heading>No messages yet</Heading>
                <Message
                  text={
                    embedded
                      ? 'Use the button below to message someone, or search for a username.'
                      : 'Tap + to message someone, ask a shop about a watch, or write from a post.'
                  }
                />
              </Centered>
            )
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              selected={item.id === selectedConversationId}
              desktop={desktopInbox}
              onOpenParty={() => openParty(item.with)}
              onPress={() => openConversation({ conversationId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

function said(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('yours')) return 'That username is yours.';
  if (message.includes('not valid')) return 'That username is not valid.';
  if (message.includes('No one has')) return 'No one has that username.';
  if (message.includes('sign in') || message.includes('signed-in')) return 'Sign in to send a message.';
  return 'Could not open that conversation.';
}

const screenLayout = {
  searchBlock: {
    ...searchFieldInset,
    marginTop: space.sm - space.lg,
    gap: space.sm,
  },
  query: {},
  filters: {},
  compose: {},
  list: {},
  note: {},
};

const desktopInboxLayout = {
  searchBlock: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  query: {},
  filters: {
    paddingHorizontal: space.xs,
  },
  compose: {
    paddingHorizontal: space.md,
  },
  list: {
    paddingHorizontal: 0,
    paddingBottom: space.lg,
  },
  note: {
    paddingHorizontal: space.md,
  },
};

const embeddedLayout = {
  searchBlock: {
    paddingBottom: space.md,
    gap: space.sm,
  },
  query: {},
  filters: {},
  compose: {
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: 0,
    paddingBottom: space.lg,
  },
  note: {
    paddingHorizontal: 0,
  },
};

const listStyles = (theme: Theme) => ({
  root: {
    flex: 1,
  },
  inboxSearchBlock: {
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    marginBottom: space.xs,
  },
  searchBlock: {
    gap: space.sm,
  },
  filters: {},
  query: {},
  toolbar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  searchInToolbar: {
    flex: 1,
    minWidth: 0,
  },
  compose: {
    paddingHorizontal: inset.screen,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  empty: {
    flexGrow: 1,
  },
  note: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.sm,
  },
});
