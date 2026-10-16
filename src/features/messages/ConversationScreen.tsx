import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';

import { SendBar } from '@/components/SendBar';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useOpenMailDraft } from '@/data/inquiries';
import { keys } from '@/data/keys';
import { useListing, usePrimeListing } from '@/data/listings';
import {
  isPending as isSending,
  useConversation,
  useMarkConversationRead,
  useRenameGroup,
  useSendMessage,
  type Message as ChatMessage,
  type MessageListing,
} from '@/data/messages';
import { formatRelativeTime, formatTitle } from '@/lib/format';
import { useKeyboardLift } from '@/lib/keyboard';
import { useOpenStack } from '@/lib/openStack';
import { inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { Bubble } from './Bubble';
import { GroupTitle } from './GroupTitle';
import { ListingQuote } from './ListingQuote';
import { useOpenParty } from './openParty';
import { PartyAvatar } from './PartyAvatar';
import { memberLabel, partyLine, partyName } from './party';

/** The first thing you send a shop about a watch, until you write your own. */
const DEFAULT_INQUIRY = 'Hey, is this watch still available?';

/** A run of messages from one person inside this many minutes shows one time. */
const RUN = 60 * 60 * 1000;

export function ConversationScreen({
  conversationId,
  listingId = null,
}: {
  conversationId: string;
  /** Set when this visit is a reply to one watch. The sent message names it. */
  listingId?: string | null;
}) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const styles = useThemedStyles(screenStyles);
  const lift = useKeyboardLift();
  const list = useRef<FlatList<ChatMessage>>(null);
  // Null until they edit. The default below is what an untouched field shows,
  // so clearing the sentence stays cleared.
  const [draft, setDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const { data, isPending, error } = useConversation(conversationId);
  const { data: listing } = useListing(listingId ?? '');
  const primeListing = usePrimeListing();
  const open = useOpenStack();
  const openParty = useOpenParty();
  const quote: MessageListing | null = listing
    ? {
        id: listing.id,
        title: formatTitle(listing),
        photoUrl: listing.photos[0]?.url ?? null,
      }
    : null;
  // Wishlist opens this thread with the watch still named. Once a message
  // already quotes it, the composer must not quote it again.
  const asked = Boolean(
    listingId && data?.messages.some((message) => message.listing?.id === listingId),
  );
  const quoting = quote && !asked ? quote : null;
  const value = draft ?? (listingId && data && !asked ? DEFAULT_INQUIRY : '');
  const send = useSendMessage(
    conversationId,
    userId ?? '',
    quoting ? { listingId: quoting.id, title: quoting.title, photoUrl: quoting.photoUrl } : null,
  );
  const mail = useOpenMailDraft(userId);
  const mark = useMarkConversationRead().mutate;
  const rename = useRenameGroup(conversationId);
  const close = () => router.back();

  function openWatch(id: string) {
    if (listing?.id === id) primeListing(listing);
    open('listing/[listingId]', { listingId: id }, `/listing/${id}`);
  }

  const last = data?.messages.at(-1)?.id;
  useEffect(() => {
    // Read when the thread opens, and again each time something lands in it
    // while it is open. `mutate` is stable, so this runs on the id alone.
    if (last) mark(conversationId);
  }, [conversationId, last, mark]);

  if (isPending) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Spinner />
      </Screen>
    );
  }

  if (error || !data?.header) {
    return (
      <Screen action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="That conversation is not there." tone="error" />
        </Centered>
      </Screen>
    );
  }

  const { header, messages } = data;
  const who = header.with;
  // A shop with no account here cannot read the app. The same field writes
  // the email instead, and the inquiry lands back in this thread.
  const byEmail = !header.writable;

  function submit() {
    const body = value.trim();
    if (!body) return;

    if (byEmail) {
      if (!listing || mail.isPending) return;
      mail.mutate(
        { card: listing, message: body },
        {
          onSuccess: () => {
            setDraft('');
            void queryClient.invalidateQueries({ queryKey: keys.conversation(conversationId) });
          },
          onError: (error) => Alert.alert('Could not open Gmail', error.message),
        },
      );
      return;
    }

    if (send.isPending) return;
    // The field clears as the bubble rises. If the write fails the words come
    // back to the field, unless something new has been typed over them.
    setDraft('');
    send.mutate(body, {
      onError: () => setDraft((current) => current || body),
    });
  }

  return (
    <Screen
      title={who.kind === 'group' ? undefined : partyName(who)}
      titleControl={
        who.kind === 'group' ? (
          <GroupTitle
            name={partyName(who)}
            givenName={who.givenName}
            editing={renaming}
            onStart={() => setRenaming(true)}
            onClose={() => setRenaming(false)}
            onCommit={(title) => {
              setRenaming(false);
              rename.mutate(title, {
                onError: (error) => Alert.alert('Could not rename the group', renameError(error)),
              });
            }}
          />
        ) : undefined
      }
      titleSize="title"
      subtitle={
        byEmail ? (
          <View style={styles.unclaimed}>
            <Text style={styles.unclaimedLabel}>
              Not claimed on Graham yet. Your inquiry goes to their email until they claim their
              profile.
            </Text>
          </View>
        ) : (
          (partyLine(who) ?? undefined)
        )
      }
      leading={<PartyAvatar who={who} px={size.avatarHeader} onPress={() => openParty(who)} />}
      action={<CloseButton onPress={close} />}>
      <View style={[styles.fill, { paddingBottom: lift }]}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          // The bottom of a conversation is the live end of it, so a thread
          // opens there and stays there as messages arrive.
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const watchId = item.listing?.id;
            const mine = item.sender_id === userId;
            return (
              <Bubble
                body={item.body}
                mine={mine}
                listing={item.listing}
                onOpenListing={watchId ? () => openWatch(watchId) : undefined}
                caption={item.via === 'email' ? 'Sent by email' : null}
                speaker={
                  who.kind === 'group' && !mine && startOfRun(messages, index)
                    ? memberLabel(header.members, item.sender_id)
                    : null
                }
                when={endOfRun(messages, index) ? formatRelativeTime(item.created_at) : null}
                // The pending row is the one that rises. The server's copy of it
                // takes its place without moving, so one send is one arrival.
                sent={isSending(item)}
              />
            );
          }}
        />
        {!byEmail || listing ? (
          <SendBar
            placeholder={quoting ? 'Write about this watch' : 'Write a message'}
            value={value}
            onChangeText={setDraft}
            onSend={submit}
            busy={byEmail ? mail.isPending : send.isPending}
            sendLabel={byEmail ? `Email ${partyName(who)}` : undefined}
            note={
              quoting || send.error ? (
                <View style={styles.note}>
                  {quoting ? (
                    <ListingQuote listing={quoting} onPress={() => openWatch(quoting.id)} />
                  ) : null}
                  {send.error ? <Message text="That message did not send." tone="error" /> : null}
                </View>
              ) : null
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}

/** The first message of a run: the previous one is someone else's, or this is the start. */
function renameError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('40 characters')) return 'A group name is at most 40 characters.';
  if (message.includes('not yours')) return 'You are not in that group.';
  if (message.includes('sign in') || message.includes('signed-in')) return 'Sign in to send a message.';
  return 'Try again in a moment.';
}

function startOfRun(messages: ChatMessage[], index: number) {
  const previous = messages[index - 1];
  if (!previous) return true;
  return previous.sender_id !== messages[index].sender_id;
}

/** The last message of a run: the next one is someone else's, or an hour later. */
function endOfRun(messages: ChatMessage[], index: number) {
  const message = messages[index];
  const next = messages[index + 1];
  if (!next) return true;
  if (next.sender_id !== message.sender_id) return true;
  return new Date(next.created_at).getTime() - new Date(message.created_at).getTime() > RUN;
}

const screenStyles = (theme: Theme) => ({
  fill: { flex: 1 },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.lg,
    gap: space.sm,
    flexGrow: 1,
    justifyContent: 'flex-end' as const,
  },
  note: {
    gap: space.xs,
  },
  // On the subtitle's line, so it starts under the name rather than under the logo.
  unclaimed: {
    alignSelf: 'flex-start' as const,
    marginTop: space.xs,
    backgroundColor: theme.color.caution,
    borderRadius: radius.lg,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
  },
  unclaimedLabel: {
    ...type.caption,
    color: theme.color.onCaution,
  },
});
