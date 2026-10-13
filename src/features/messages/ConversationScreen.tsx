import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';

import { ActionPill } from '@/components/ActionBar';
import { SendBar } from '@/components/SendBar';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useOpenMailDraft } from '@/data/inquiries';
import { keys } from '@/data/keys';
import { useListing } from '@/data/listings';
import {
  isPending as isSending,
  useConversation,
  useMarkConversationRead,
  useSendMessage,
  type Message as ChatMessage,
} from '@/data/messages';
import { formatRelativeTime, formatTitle } from '@/lib/format';
import { useKeyboardLift } from '@/lib/keyboard';
import { inset, space, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { Bubble } from './Bubble';
import { partyLine, partyName } from './party';

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
  const [draft, setDraft] = useState('');

  const { data, isPending, error } = useConversation(conversationId);
  const { data: listing } = useListing(listingId ?? '');
  const about = listing ? formatTitle(listing) : null;
  const send = useSendMessage(
    conversationId,
    userId ?? '',
    listingId ? { listingId, title: about } : null,
  );
  const mail = useOpenMailDraft(userId);
  const mark = useMarkConversationRead().mutate;
  const close = () => router.back();

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

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending) return;
    // The field clears as the bubble rises. If the write fails the words come
    // back to the field, unless something new has been typed over them.
    setDraft('');
    send.mutate(body, {
      onError: () => setDraft((current) => current || body),
    });
  }

  return (
    <Screen
      title={partyName(who)}
      subtitle={partyLine(who) ?? undefined}
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
          ListEmptyComponent={
            <Message text="No messages yet. Say what you are after." />
          }
          renderItem={({ item, index }) => (
            <Bubble
              body={item.body}
              mine={item.sender_id === userId}
              caption={caption(item)}
              when={endOfRun(messages, index) ? formatRelativeTime(item.created_at) : null}
              // The pending row is the one that rises. The server's copy of it
              // takes its place without moving, so one send is one arrival.
              sent={isSending(item)}
            />
          )}
        />
        {header.writable ? (
          <SendBar
            placeholder={about ? 'Write about this watch' : 'Write a message'}
            value={draft}
            onChangeText={setDraft}
            onSend={submit}
            busy={send.isPending}
            note={
              about || send.error ? (
                <View style={styles.note}>
                  {about ? <Text style={styles.about}>About {about}</Text> : null}
                  {send.error ? <Message text="That message did not send." tone="error" /> : null}
                </View>
              ) : null
            }
          />
        ) : (
          // A shop with no account here cannot be written to in the app. The
          // thread is still the record of what was asked. Email is how the
          // message leaves, and the inquiry lands in this same thread.
          <View style={styles.closed}>
            {about ? <Text style={styles.about}>About {about}</Text> : null}
            <Message
              text={`${partyName(who)} has not claimed their shop on Graham. Their reply comes to your email.`}
            />
            {listing ? (
              <ActionPill
                icon="email-outline"
                label={`Email ${partyName(who)}`}
                text="Email the shop"
                busy={mail.isPending}
                onPress={() =>
                  mail.mutate(
                    { card: listing, message: '' },
                    {
                      onSuccess: () => {
                        void queryClient.invalidateQueries({
                          queryKey: keys.conversation(conversationId),
                        });
                      },
                      onError: (error) => Alert.alert('Could not open Gmail', error.message),
                    },
                  )
                }
              />
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

function caption(message: ChatMessage) {
  const about = message.listing ? `About ${message.listing}` : null;
  if (message.via === 'email') return about ? `${about} · Sent by email` : 'Sent by email';
  return about;
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
  about: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  closed: {
    paddingHorizontal: inset.screen,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
});
