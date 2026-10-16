import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';

import { SearchField } from '@/components/SearchBar';
import { Button, Centered, Message, Spinner } from '@/components/ui';
import { keys } from '@/data/keys';
import {
  useCreateGroup,
  useSuggestPeople,
  type PersonSuggestion,
} from '@/data/messages';
import { useKeyboardLift } from '@/lib/keyboard';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { ConversationRow } from './ConversationRow';
import { GroupDoor } from './GroupDoor';
import { useOpenParty } from './openParty';
import { useDebounced } from './useDebounced';

/** Each letter is not a search. Suggestions are asked once typing pauses. */
const SUGGEST_PAUSE = 300;

/** Besides you. `create_group` refuses the same number. */
const GROUP_OTHERS = 12;

/**
 * Pick at least two people and open one thread with all of them. The same
 * set opens the group that already exists, so Create does not fork a second
 * thread with the same names on it.
 */
export function CreateGroup({ onMessageOne }: { onMessageOne: () => void }) {
  const styles = useThemedStyles(groupStyles);
  const openParty = useOpenParty();
  const queryClient = useQueryClient();
  const lift = useKeyboardLift();
  const field = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PersonSuggestion[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const term = query.trim();
  const debounced = useDebounced(term, SUGGEST_PAUSE);
  const suggestions = useSuggestPeople(debounced);
  const create = useCreateGroup();
  const ready = debounced === term;
  const people = ready ? (suggestions.data ?? []) : [];
  // A search hides anyone it does not match. Keep them on the list so a
  // person already chosen can be taken off without clearing the field.
  const shown = [
    ...picked.filter((person) => !people.some((row) => row.id === person.id)),
    ...people,
  ];

  useEffect(() => {
    const id = setTimeout(() => field.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  function toggle(person: PersonSuggestion) {
    if (create.isPending) return;
    const on = picked.some((chosen) => chosen.id === person.id);
    if (!on && picked.length >= GROUP_OTHERS) {
      setFailure('A group holds at most 12 other people.');
      return;
    }
    setFailure(null);
    setPicked(on ? picked.filter((chosen) => chosen.id !== person.id) : [...picked, person]);
  }

  function createGroup() {
    if (picked.length < 2 || create.isPending) return;
    create.mutate(
      picked.map((person) => person.id),
      {
        onSuccess: (conversationId) => {
          void queryClient.invalidateQueries({ queryKey: keys.conversations });
          router.replace(`/conversation/${conversationId}`);
        },
        onError: (error) => setFailure(said(error)),
      },
    );
  }

  const chosen = picked.map((person) => person.name ?? `@${person.handle}`).join(', ');

  return (
    <View style={[styles.root, { paddingBottom: lift }]}>
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
        <GroupDoor grouping onPress={onMessageOne} />
        {chosen ? (
          <Text style={styles.chosen} numberOfLines={2}>
            {chosen}
          </Text>
        ) : null}
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
      ) : shown.length === 0 ? (
        <Centered>
          <Message text={term ? 'No one matches.' : 'No one else is here yet.'} />
        </Centered>
      ) : (
        <FlatList
          style={styles.list}
          data={shown}
          keyExtractor={(person) => person.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const on = picked.some((person) => person.id === item.id);
            const who = {
              kind: 'person' as const,
              userId: item.id,
              name: item.name,
              handle: item.handle,
              number: item.number,
              avatar_url: item.avatarUrl,
            };
            const name = item.name ?? `@${item.handle}`;
            return (
              <ConversationRow
                conversation={{ id: item.id, with: who, last: null, unread: 0 }}
                detail={`@${item.handle}`}
                label={on ? `Remove ${name}` : `Add ${name}`}
                selected={on}
                busy={create.isPending}
                onOpenParty={() => openParty(who)}
                onPress={() => toggle(item)}
              />
            );
          }}
        />
      )}
      <View style={styles.create}>
        <Button
          label="Create group"
          onPress={createGroup}
          disabled={picked.length < 2}
          loading={create.isPending}
        />
      </View>
    </View>
  );
}

function said(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('at least two')) return 'Choose at least two other people.';
  if (message.includes('at most 12')) return 'A group holds at most 12 other people.';
  if (message.includes('gone')) return 'One of those accounts is gone.';
  if (message.includes('sign in') || message.includes('signed-in')) return 'Sign in to send a message.';
  return 'Could not create that group.';
}

const groupStyles = (theme: Theme) => ({
  root: {
    flex: 1,
  },
  query: {
    marginTop: space.sm - space.lg,
    paddingHorizontal: inset.screen,
    gap: space.sm,
  },
  chosen: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.lg,
  },
  note: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.sm,
  },
  create: {
    paddingHorizontal: inset.screen,
    paddingTop: space.sm,
    paddingBottom: space.md,
    alignItems: 'flex-start' as const,
  },
});
