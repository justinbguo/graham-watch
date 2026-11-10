import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { SendBar } from '@/components/SendBar';
import { Centered, CloseButton, Message, Screen, Spinner } from '@/components/ui';
import { useOpenMailDraft } from '@/data/inquiries';
import { keys } from '@/data/keys';
import { logEvent } from '@/data/listingEvents';
import { useDealerInquiryListing, useListing, usePrimeListing } from '@/data/listings';
import {
  isPending as isSending,
  useConversation,
  useMarkConversationRead,
  useRenameGroup,
  threadNamesListing,
  useSendMessage,
  type Message as ChatMessage,
  type MessageListing,
  type MessagePhoto,
} from '@/data/messages';
import { DealCard } from '@/features/messages/DealCard';
import { DealSheetPortals } from '@/features/messages/DealSheetPortals';
import { useDealSheets } from '@/features/messages/DealSheets';
import { OfferDealButton } from '@/features/messages/OfferDealButton';
import { useClaimedDealerShop } from '@/features/seller-hub/claimedShop';
import { track } from '@/lib/analytics';
import { formatRelativeTime, formatTitle } from '@/lib/format';
import { useKeyboardLift } from '@/lib/keyboard';
import { useOpenStack } from '@/lib/openStack';
import { inset, radius, size, space, type, type Theme } from '@/lib/theme';
import { useSession } from '@/providers/session';
import { useThemedStyles } from '@/providers/theme';

import { AttachPhoto } from './AttachPhoto';
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
  layout = 'screen',
  onLeaveThread,
}: {
  conversationId: string;
  /** Set when this visit is a reply to one watch. The sent message names it. */
  listingId?: string | null;
  /** Desktop split: thread in the right pane, not a stack sheet. */
  layout?: 'screen' | 'pane';
  onLeaveThread?: () => void;
}) {
  const { userId } = useSession();
  const { shop } = useClaimedDealerShop();
  const queryClient = useQueryClient();
  const styles = useThemedStyles(screenStyles);
  const lift = useKeyboardLift();
  const list = useRef<FlatList<ChatMessage>>(null);
  // Null until they edit. The default below is what an untouched field shows,
  // so clearing the sentence stays cleared.
  const [draft, setDraft] = useState<string | null>(null);
  const [photo, setPhoto] = useState<MessagePhoto | null>(null);
  const [renaming, setRenaming] = useState(false);

  const { data, isPending, error, isFetching } = useConversation(conversationId, userId);
  const namedListingId =
    listingId ?? data?.messages.find((message) => message.listing)?.listing?.id ?? null;
  const { data: listing } = useListing(namedListingId ?? '');
  const emailDealerId =
    data?.header && !data.header.writable ? data.header.threadDealerId : null;
  const needsEmailListing = Boolean(emailDealerId && !namedListingId);
  const { data: dealerInquiryListing, isPending: dealerListingPending } = useDealerInquiryListing(
    needsEmailListing ? emailDealerId : null,
  );
  const inquiryCard = listing ?? dealerInquiryListing ?? null;
  const primeListing = usePrimeListing();
  const open = useOpenStack();
  const openParty = useOpenParty();
  const quote: MessageListing | null = listing
    ? {
        id: listing.id,
        title: formatTitle(listing),
        photoUrl: listing.photos[0]?.url ?? null,
        priceCents: listing.price_cents,
      }
    : null;
  // Wishlist opens this thread with the watch still named. Once a message
  // already quotes it, the composer must not quote it again.
  const messages = data?.messages ?? [];
  const askedAboutQuote =
    quote && messages.length > 0 ? threadNamesListing(messages, quote.id) : false;
  const askedFromRoute =
    listingId && messages.length > 0 ? threadNamesListing(messages, listingId) : false;
  const asked = askedAboutQuote || askedFromRoute;
  const quoting = quote && !asked ? quote : null;
  const value = draft ?? (quoting && data ? DEFAULT_INQUIRY : '');
  const send = useSendMessage(
    conversationId,
    userId ?? '',
    quoting ? { listingId: quoting.id, title: quoting.title, photoUrl: quoting.photoUrl } : null,
  );
  const mail = useOpenMailDraft(userId);
  const mark = useMarkConversationRead().mutate;
  const rename = useRenameGroup(conversationId);
  const pane = layout === 'pane';
  const close = () => {
    if (pane && onLeaveThread) {
      onLeaveThread();
      return;
    }
    router.back();
  };

  function openWatch(id: string) {
    if (listing?.id === id) primeListing(listing);
    open('listing/[listingId]', { listingId: id }, `/listing/${id}`);
  }

  const listingFromThread = messages.find((message) => message.listing)?.listing ?? null;
  const offerListing: MessageListing | null =
    quote ??
    listingFromThread ??
    (listing && listingId
      ? {
          id: listing.id,
          title: formatTitle(listing),
          photoUrl: listing.photos[0]?.url ?? null,
          priceCents: listing.price_cents,
        }
      : null);
  const dealSheets = useDealSheets({
    conversationId,
    offerListing,
    sellerName: data?.header ? partyName(data.header.with) : 'the seller',
    onOpenListing: openWatch,
  });

  const last = data?.messages.at(-1)?.id;
  useEffect(() => {
    // Read when the thread opens, and again each time something lands in it
    // while it is open. `mutate` is stable, so this runs on the id alone.
    if (last) mark(conversationId);
  }, [conversationId, last, mark]);

  if (!userId || ((isPending || isFetching) && !data)) {
    return pane ? (
      <View style={styles.fill}>
        <Spinner />
      </View>
    ) : (
      <Screen action={<CloseButton onPress={close} />}>
        <Spinner />
      </Screen>
    );
  }

  if (error || !data?.header) {
    return pane ? (
      <View style={styles.fill}>
        <Centered>
          <Message text="That conversation is not there." tone="error" />
        </Centered>
      </View>
    ) : (
      <Screen action={<CloseButton onPress={close} />}>
        <Centered>
          <Message text="That conversation is not there." tone="error" />
        </Centered>
      </Screen>
    );
  }

  const { header } = data;
  const who = header.with;
  // A shop with no account here cannot read the app. The same field writes
  // the email instead, and the inquiry lands back in this thread.
  const byEmail = !header.writable;
  const dealListingId =
    listingId ?? messages.find((message) => message.listing)?.listing?.id ?? null;
  const dealListing: MessageListing | null =
    quote ??
    (() => {
      const fromThread = messages.find((message) => message.listing)?.listing;
      if (fromThread) return fromThread;
      if (inquiryCard && dealListingId) {
        return {
          id: dealListingId,
          title: formatTitle(inquiryCard),
          photoUrl: inquiryCard.photos[0]?.url ?? null,
          priceCents: inquiryCard.price_cents,
        };
      }
      return null;
    })();
  // Composer offer is seller-only: claimed shop owner, buyer on the other end, watch named in thread.
  const isShopSeller = Boolean(
    shop && header.threadDealerId === shop.id && who.kind === 'person',
  );
  const canOfferDeal =
    header.writable && !byEmail && isShopSeller && offerListing !== null;

  function submit() {
    const body = value.trim();
    if (!body && !photo) return;

    if (byEmail) {
      if (!body || !inquiryCard || mail.isPending) {
        if (!inquiryCard && !dealerListingPending) {
          Alert.alert(
            'No watches listed',
            'This shop has nothing for sale on Graham yet, so there is no inquiry to send.',
          );
        }
        return;
      }
      logEvent({ kind: 'inquiry_open', surface: 'messages', listing: inquiryCard });
      mail.mutate(
        { card: inquiryCard, message: body },
        {
          onSuccess: () => {
            setDraft('');
            void queryClient.invalidateQueries({ queryKey: keys.conversation(conversationId) });
            void queryClient.invalidateQueries({ queryKey: keys.conversations });
          },
          onError: (error) => Alert.alert('Could not open Gmail', error.message),
        },
      );
      return;
    }

    if (send.isPending) return;
    const sending = photo;
    // The field clears as the bubble rises. If the write fails the words come
    // back to the field, unless something new has been typed over them.
    setDraft('');
    setPhoto(null);
    send.mutate(
      { body, photo: sending },
      {
        onError: () => {
          setDraft((current) => current || body);
          setPhoto((current) => current ?? sending);
        },
        onSuccess: () => {
          if (isShopSeller) track('dealer_reply', { conversation_id: conversationId });
        },
      },
    );
  }

  const titleControl =
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
    ) : undefined;

  const subtitle = byEmail ? (
    <View style={styles.unclaimed}>
      <Text style={styles.unclaimedLabel}>
        Not claimed on Graham yet. Your inquiry goes to their email until they claim their profile.
      </Text>
    </View>
  ) : (
    (partyLine(who) ?? undefined)
  );

  const messageList = (
        <FlatList
          ref={list}
          style={styles.listView}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={pane ? styles.listPane : styles.list}
          keyboardShouldPersistTaps="handled"
          // The bottom of a conversation is the live end of it, so a thread
          // opens there and stays there as messages arrive.
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const watchId = item.listing?.id;
            const mine = item.sender_id === userId;
            if (item.deal && userId) {
              return (
                <DealCard
                  deal={item.deal}
                  mine={mine}
                  viewerId={userId}
                  listing={
                    item.listing ??
                    (item.deal.listingId && dealListing?.id === item.deal.listingId
                      ? dealListing
                      : null)
                  }
                  onOpenListing={watchId ? () => openWatch(watchId) : undefined}
                  busy={dealSheets.busy}
                  {...dealSheets.actionsFor(item.deal)}
                />
              );
            }
            const peerMark =
              pane && !mine && who.kind !== 'group' && startOfRun(messages, index);
            const bubble = (
              <Bubble
                body={item.body}
                mine={mine}
                inPane={pane}
                listing={item.listing}
                onOpenListing={watchId ? () => openWatch(watchId) : undefined}
                caption={item.via === 'email' ? 'Sent by email' : null}
                photoUrl={item.photoUrl}
                speaker={
                  who.kind === 'group' && !mine && startOfRun(messages, index)
                    ? memberLabel(header.members, item.sender_id)
                    : null
                }
                when={endOfRun(messages, index) ? formatRelativeTime(item.created_at) : null}
                sent={isSending(item)}
              />
            );
            if (!pane || mine) {
              return bubble;
            }
            return (
              <View style={styles.paneMessageRow}>
                {peerMark ? (
                  <PartyAvatar who={who} px={size.avatarSmall} onPress={() => openParty(who)} />
                ) : (
                  <View style={styles.paneMessageGutter} />
                )}
                <View style={styles.paneMessageBody}>{bubble}</View>
              </View>
            );
          }}
        />
  );

  const composer = (
        <SendBar
          placeholder={quoting ? 'Write about this watch' : pane ? 'Message…' : 'Write a message'}
          multiline
          chrome={pane ? 'pane' : 'screen'}
          value={value}
          onChangeText={setDraft}
          onSend={submit}
          busy={byEmail ? mail.isPending || dealerListingPending : send.isPending}
          sendLabel={byEmail ? `Email ${partyName(who)}` : undefined}
          canSend={value.trim().length > 0 || Boolean(photo)}
          leading={
            byEmail
              ? undefined
              : (
                  <AttachPhoto
                    disabled={send.isPending}
                    onPick={setPhoto}
                    onError={(message) => Alert.alert('Could not add that photo', message)}
                  />
                )
          }
          trailing={
            canOfferDeal ? (
              <OfferDealButton disabled={send.isPending} onPress={dealSheets.openOffer} />
            ) : undefined
          }
          note={
            quoting || photo || send.error || (byEmail && !inquiryCard) ? (
              <View style={styles.note}>
                {quoting ? (
                  <ListingQuote listing={quoting} onPress={() => openWatch(quoting.id)} />
                ) : null}
                {byEmail && !inquiryCard && !dealerListingPending ? (
                  <Message
                    text="This shop has no watches listed on Graham yet."
                    tone="error"
                  />
                ) : null}
                {photo ? (
                  <View style={styles.draft}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.draftPhoto}
                      contentFit="cover"
                      accessibilityLabel="Photo to send"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      onPress={() => setPhoto(null)}
                      style={styles.remove}>
                      <Text style={styles.removeLabel}>Remove</Text>
                    </Pressable>
                  </View>
                ) : null}
                {send.error ? (
                  <Message
                    text={send.error.message || 'That message did not send.'}
                    tone="error"
                  />
                ) : null}
              </View>
            ) : null
          }
        />
  );

  const dealPortals = (
    <DealSheetPortals
      sheet={dealSheets.sheet}
      conversationId={dealSheets.conversationId}
      offerListing={dealSheets.offerListing}
      sellerName={dealSheets.sellerName}
      onOpenListing={dealSheets.onOpenListing}
      onClose={dealSheets.close}
    />
  );

  if (pane) {
    return (
      <View style={styles.pane}>
        <View style={styles.paneHeaderBar}>
          <PartyAvatar who={who} px={size.avatarHeader} onPress={() => openParty(who)} />
          <View style={styles.paneHeading}>
            {titleControl ?? (
              <Text style={styles.paneTitle} numberOfLines={1}>
                {partyName(who)}
              </Text>
            )}
            {typeof subtitle === 'string' ? (
              <Text style={styles.paneSubtitle} numberOfLines={1}>{subtitle}</Text>
            ) : (
              subtitle
            )}
          </View>
        </View>
        <View style={styles.paneWell}>{messageList}</View>
        <View style={[styles.paneComposer, { paddingBottom: lift }]}>
          {composer}
          {dealPortals}
        </View>
      </View>
    );
  }

  return (
    <Screen
      title={who.kind === 'group' ? undefined : partyName(who)}
      titleControl={titleControl}
      titleSize="title"
      subtitle={subtitle}
      leading={<PartyAvatar who={who} px={size.avatarHeader} onPress={() => openParty(who)} />}
      action={<CloseButton onPress={close} />}>
      <View style={[styles.fill, { paddingBottom: lift }]}>
        {messageList}
        {composer}
        {dealPortals}
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
  pane: {
    flex: 1,
    minHeight: 0,
  },
  paneHeaderBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: theme.color.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  paneWell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.color.background,
  },
  paneComposer: {
    backgroundColor: theme.color.background,
  },
  paneMessageRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: space.sm,
    width: '100%' as const,
  },
  paneMessageGutter: {
    width: size.avatarSmall,
    flexShrink: 0,
  },
  paneMessageBody: {
    flex: 1,
    minWidth: 0,
  },
  paneHeading: {
    flex: 1,
    minWidth: 0,
    gap: space.xs,
  },
  paneTitle: {
    ...type.title,
    color: theme.color.text,
  },
  paneSubtitle: {
    ...type.caption,
    color: theme.color.textMuted,
  },
  listView: { flex: 1 },
  list: {
    paddingHorizontal: inset.screen,
    paddingBottom: space.lg,
    gap: space.sm,
    flexGrow: 1,
    justifyContent: 'flex-end' as const,
  },
  listPane: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
    flexGrow: 1,
    justifyContent: 'flex-end' as const,
  },
  note: {
    gap: space.xs,
  },
  draft: {
    alignSelf: 'flex-end' as const,
    gap: space.xs,
  },
  draftPhoto: {
    width: size.messagePhoto,
    height: size.messagePhoto,
    borderRadius: radius.md,
    backgroundColor: theme.color.surfaceSunken,
  },
  remove: {
    alignSelf: 'flex-end' as const,
  },
  removeLabel: {
    ...type.caption,
    color: theme.color.textMuted,
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
