import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';

import { Button, Centered, Eyebrow, Field, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useOpenMailDraft, useSendInquiry } from '@/data/inquiries';
import { logEvent } from '@/data/listingEvents';
import { useListing, usePrimeListing } from '@/data/listings';
import { DealerSiteButton } from '@/features/listings/DealerSiteButton';
import { useOpenStack } from '@/lib/openStack';
import { inset, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export default function InquiryScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const primeListing = usePrimeListing();
  const open = useOpenStack();
  const [message, setMessage] = useState('');
  const sendInquiry = useSendInquiry(userId);
  const openMailDraft = useOpenMailDraft(userId);
  const styles = useThemedStyles(inquiryStyles);
  const busy = sendInquiry.isPending || openMailDraft.isPending;
  const failure = sendInquiry.error ?? openMailDraft.error;

  if (isPending) {
    return (
      <Screen title="Contact dealer" inSheet>
        <Spinner />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen title="Contact dealer" inSheet>
        <Centered>
          <Message text="That watch is no longer available." tone="error" />
          <Button label="Close" variant="outline" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  const dealerName = card.dealer?.name ?? 'The dealer';

  if (sendInquiry.isSuccess) {
    return (
      <Screen title="Contact dealer" inSheet>
        <Centered>
          <Heading>Inquiry sent</Heading>
          <Message text={`${dealerName} will get your message with a link to this watch.`} />
          <Button label="Done" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  // The composer opened. Whether they sent it is between them and their mail
  // app, so this does not claim the dealer heard from them.
  if (openMailDraft.isSuccess) {
    return (
      <Screen title="Contact dealer" inSheet>
        <Centered>
          <Heading>Draft ready</Heading>
          <Message
            text={`We filled in an email to ${dealerName}. Send it from your mail app and their reply comes straight to you.`}
          />
          <Button label="Done" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Contact dealer" inSheet>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View this watch"
          onPress={() => {
            primeListing(card);
            open('listing/[listingId]', { listingId: card.id }, `/listing/${card.id}`);
          }}
          style={styles.summary}>
          <Eyebrow>{card.brand}</Eyebrow>
          <Text style={styles.model}>{card.model ?? 'Unknown model'}</Text>
          <Message text={`Sold by ${card.dealer?.name ?? 'an unlisted dealer'}`} />
          {card.description ? <Text style={styles.description}>{card.description}</Text> : null}
          <Text style={styles.view}>View watch</Text>
        </Pressable>

        <Field
          value={message}
          onChangeText={setMessage}
          placeholder="Anything you want to ask? (optional)"
          multiline
          numberOfLines={4}
          autoCapitalize="sentences"
          style={styles.messageField}
        />

        <Message text="Either way you deal with the dealer directly — no payment happens here. Your mail app sends it as you; Graham sends it for you and points the reply back at your inbox." />

        {failure ? <Message text={failure.message} tone="error" /> : null}

        <View style={styles.actions}>
          <DealerSiteButton card={card} surface="messages" />
          <Button
            label="Open in my mail app"
            variant="solid"
            loading={openMailDraft.isPending}
            disabled={busy}
            onPress={() => {
              logEvent({ kind: 'inquiry_open', surface: 'messages', listing: card });
              openMailDraft.mutate({ card, message });
            }}
          />
          <Button
            label="Send via Graham"
            loading={sendInquiry.isPending}
            disabled={busy}
            onPress={() => sendInquiry.mutate({ card, message })}
          />
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const inquiryStyles = (theme: Theme) => ({
  body: {
    flex: 1,
    paddingHorizontal: inset.screen,
    paddingBottom: inset.screen,
    gap: stack.group,
  },
  summary: {
    gap: stack.tight,
  },
  model: {
    ...type.title,
    color: theme.color.text,
  },
  // In full here. You are about to write to a dealer and this is what you have
  // to go on when deciding what to ask.
  description: {
    ...type.body,
    color: theme.color.textMuted,
    paddingTop: space.sm,
  },
  view: {
    ...type.caption,
    color: theme.color.text,
    paddingTop: space.sm,
  },
  messageField: {
    minHeight: size.fieldMultiline,
    textAlignVertical: 'top' as const,
    paddingTop: inset.controlY,
  },
  actions: {
    marginTop: 'auto' as const,
    gap: stack.related,
  },
});
