import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';

import { IconBar, SearchField, searchFieldInset } from '@/components/SearchBar';
import { Button, Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { keys } from '@/data/keys';
import { useCreateGroup, useSuggestPeople, type PersonSuggestion } from '@/data/messages';
import { useKeyboardLift } from '@/lib/keyboard';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

import { PersonPickRow } from './PersonPickRow';
import { useOpenParty } from './openParty';
import { useDebounced } from './useDebounced';

/** Each letter is not a search. Suggestions are asked once typing pauses. */
const SUGGEST_PAUSE = 300;

/** Besides you. `create_group` refuses the same number. */
const GROUP_OTHERS = 12;

/** `conversations.title` refuses a longer name. */
const GROUP_NAME = 40;

/**
 * Name a group and pick at least two people. Create sits in the header.
 * The same set opens the group that already exists. A name is kept only
 * when that group does not have one yet.
 */
export function CreateGroup() {
  const styles = useThemedStyles(groupStyles);
  const openParty = useOpenParty();
  const queryClient = useQueryClient();
  const lift = useKeyboardLift();
  const search = useRef<TextInput>(null);
  const [name, setName] = useState('');
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
  const title = name.trim().replace(/\s+/g, ' ');

  useEffect(() => {
    const id = setTimeout(() => search.current?.focus(), 50);
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
      { memberIds: picked.map((person) => person.id), title: title || null },
      {
        onSuccess: (conversationId) => {
          void queryClient.invalidateQueries({ queryKey: keys.conversations });
          // This sheet sits on New message. Close on the thread should land
          // on Messages, so both sheets go before the thread opens.
          router.dismissAll();
          router.push(`/conversation/${conversationId}`);
        },
        onError: (error) => setFailure(said(error)),
      },
    );
  }

  const chosen = picked.map((person) => person.name ?? `@${person.handle}`).join(', ');

  return (
    <Screen
      title="New group chat"
      titleSize="title"
      inSheet
      leading={<CloseButton edge="start" onPress={() => router.back()} />}
      action={
        <Button
          label="Create"
          variant="ghost"
          compact
          onPress={createGroup}
          disabled={picked.length < 2}
          loading={create.isPending}
        />
      }>
      <View style={[styles.root, { paddingBottom: lift }]}>
        <View style={styles.form}>
          <IconBar
            icon="pencil-outline"
            accessibilityLabel="Group name"
            placeholder="Group name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setFailure(null);
            }}
            autoCapitalize="words"
            autoCorrect
            maxLength={GROUP_NAME}
            returnKeyType="next"
            onSubmitEditing={() => search.current?.focus()}
          />
          <SearchField
            ref={search}
            accessibilityLabel="Search people"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setFailure(null);
            }}
          />
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
            renderItem={({ item, index }) => {
              const on = picked.some((person) => person.id === item.id);
              const who = {
                kind: 'person' as const,
                userId: item.id,
                name: item.name,
                handle: item.handle,
                number: item.number,
                avatar_url: item.avatarUrl,
              };
              const label = item.name ?? `@${item.handle}`;
              return (
                <PersonPickRow
                  who={who}
                  selected={on}
                  busy={create.isPending}
                  divider={index < shown.length - 1}
                  label={on ? `Remove ${label}` : `Add ${label}`}
                  onOpenParty={() => openParty(who)}
                  onPress={() => toggle(item)}
                />
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}

function said(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('at least two')) return 'Choose at least two other people.';
  if (message.includes('at most 12')) return 'A group holds at most 12 other people.';
  if (message.includes('40 characters')) return 'A group name is at most 40 characters.';
  if (message.includes('gone')) return 'One of those accounts is gone.';
  if (message.includes('sign in') || message.includes('signed-in')) return 'Sign in to send a message.';
  return 'Could not create that group.';
}

const groupStyles = (theme: Theme) => ({
  root: {
    flex: 1,
  },
  form: {
    ...searchFieldInset,
    marginTop: space.sm - space.lg,
    paddingBottom: space.sm,
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
});
