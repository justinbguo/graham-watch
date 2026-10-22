import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { SearchField, searchFieldInset } from '@/components/SearchBar';
import { Centered, Heading, Message, Spinner } from '@/components/ui';
import { BODY_SEARCH_MIN, useMessagesMatching } from '@/data/messages';
import { useOpenConversation } from '@/features/messages/useOpenConversation';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from '../messages/ConversationRow';
import { visibleConversations } from '../messages/match';
import { useOpenParty } from '../messages/openParty';
import { useDebounced } from '../messages/useDebounced';
import { useShopInbox } from './shopInbox';

const BODY_SEARCH_PAUSE = 300;

/** Buyer threads for a claimed shop — no outer Screen wrapper. */
export function BuyerInboxList({ dealerId }: { dealerId: string }) {
  const styles = useThemedStyles(inboxStyles);
  const openConversation = useOpenConversation();
  const openParty = useOpenParty();
  const { threads, isPending, error } = useShopInbox(dealerId);
  const [query, setQuery] = useState('');
  const term = query.trim();
  const debounced = useDebounced(term, BODY_SEARCH_PAUSE);
  const bodies = useMessagesMatching(debounced);
  const bodyIds = new Set(debounced === term ? (bodies.data ?? []) : []);
  const shown = visibleConversations(threads, term, bodyIds);
  const bodyFailed = debounced === term && term.length >= BODY_SEARCH_MIN && bodies.isError;

  return (
    <View style={styles.root}>
      <View style={styles.query}>
        <SearchField
          accessibilityLabel="Search buyer messages"
          value={query}
          onChangeText={setQuery}
          autoComplete="off"
        />
      </View>
      {bodyFailed ? (
        <View style={styles.note}>
          <Message text="Older messages did not search." tone="error" />
        </View>
      ) : null}
      {isPending ? (
        <Spinner />
      ) : error ? (
        <View style={styles.note}>
          <Message text="Buyer messages did not load." tone="error" />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(conversation) => conversation.id}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          contentContainerStyle={shown.length === 0 ? styles.empty : styles.listContent}
          ListEmptyComponent={
            term ? (
              <Centered>
                <Message text="No buyer messages match." />
              </Centered>
            ) : (
              <Centered>
                <Heading>No buyer messages yet</Heading>
                <Message
                  text="When a collector messages your shop or sends an inquiry, the thread appears here. Offer a deal from the composer."
                />
              </Centered>
            )
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onOpenParty={() => openParty(item.with)}
              onPress={() => openConversation({ conversationId: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

const inboxStyles = (_theme: Theme) => ({
  root: {
    flex: 1,
  },
  query: {
    ...searchFieldInset,
    marginTop: space.sm - space.lg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: space.xxxl,
  },
  empty: {
    flexGrow: 1,
  },
  note: {
    paddingBottom: space.sm,
  },
});
