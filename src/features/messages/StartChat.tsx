import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { SearchField } from '@/components/SearchBar';
import { Centered, Message, Spinner } from '@/components/ui';
import { keys } from '@/data/keys';
import { useMessagePerson, useSuggestPeople, type PersonSuggestion } from '@/data/messages';
import { inset, space, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from './ConversationRow';
import { useOpenParty } from './openParty';

/** Each letter is not a search. Suggestions are asked once typing pauses. */
const SUGGEST_PAUSE = 300;

/**
 * The New message sheet: a field, and people under it before anything is
 * typed. Picking one replaces the sheet with the thread, so Close on the
 * thread lands back on Messages rather than on this list.
 */
export function StartChat() {
  const styles = useThemedStyles(startStyles);
  const openParty = useOpenParty();
  const queryClient = useQueryClient();
  const field = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const term = query.trim();
  const debounced = useDebounced(term, SUGGEST_PAUSE);
  const suggestions = useSuggestPeople(debounced);
  const start = useMessagePerson();
  const ready = debounced === term;
  const people = ready ? (suggestions.data ?? []) : [];

  useEffect(() => {
    const id = setTimeout(() => field.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  function openPerson(person: PersonSuggestion) {
    if (start.isPending) return;
    start.mutate(person.id, {
      onSuccess: (conversationId) => {
        void queryClient.invalidateQueries({ queryKey: keys.conversations });
        router.replace(`/conversation/${conversationId}`);
      },
      onError: () => setFailure('Could not open that conversation.'),
    });
  }

  return (
    <View style={styles.root}>
      <View style={styles.query}>
        <SearchField
          ref={field}
          accessibilityLabel="Search people"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setFailure(null);
          }}
        />
      </View>
      {failure ? (
        <View style={styles.note}>
          <Message text={failure} tone="error" />
        </View>
      ) : null}
      {suggestions.isPending || !ready ? (
        <Spinner />
      ) : suggestions.isError ? (
        <View style={styles.note}>
          <Message text="People did not load." tone="error" />
        </View>
      ) : people.length === 0 ? (
        <Centered>
          <Message text={term ? 'No one matches.' : 'No one else is here yet.'} />
        </Centered>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(person) => person.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const who = {
              kind: 'person' as const,
              userId: item.id,
              name: item.name,
              handle: item.handle,
              number: item.number,
              avatar_url: item.avatarUrl,
            };
            return (
              <ConversationRow
                conversation={{ id: item.id, with: who, last: null, unread: 0 }}
                detail={`@${item.handle}`}
                label={item.name ? `Message ${item.name}` : `Message @${item.handle}`}
                busy={start.isPending && start.variables === item.id}
                onOpenParty={() => openParty(who)}
                onPress={() => openPerson(item)}
              />
            );
          }}
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

const startStyles = (_theme: Theme) => ({
  root: {
    flex: 1,
  },
  query: {
    marginTop: space.sm - space.lg,
    paddingHorizontal: inset.screen,
    paddingBottom: space.md,
  },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.xxxl,
  },
  note: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.sm,
  },
});
