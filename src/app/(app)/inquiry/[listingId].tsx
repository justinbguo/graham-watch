import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Centered, Eyebrow, Field, Heading, Message, Screen, Spinner } from '@/components/ui';
import { inquiryByListing, useInquiries, useSendInquiry } from '@/data/inquiries';
import { useListing } from '@/data/listings';
import { inset, size, space, stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export default function InquiryScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const { data: inquiries = [] } = useInquiries(userId);
  const [message, setMessage] = useState('');
  const sendInquiry = useSendInquiry(userId);
  const styles = useThemedStyles(inquiryStyles);

  const existing = useMemo(
    () => inquiryByListing(inquiries).get(listingId),
    [inquiries, listingId]
  );

  if (isPending) {
    return (
      <Screen title="Contact dealer">
        <Spinner />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen title="Contact dealer">
        <Centered>
          <Message text="That watch is no longer available." tone="error" />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  if (card.sold_at) {
    return (
      <Screen title="Contact dealer">
        <Centered>
          <Heading>Sold</Heading>
          <Message
            text={`${card.dealer?.name ?? 'The dealer'} no longer has this watch. There is nothing to ask about.`}
          />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  if (existing?.status === 'sent' && !sendInquiry.isSuccess) {
    return (
      <Screen title="Contact dealer">
        <Centered>
          <Heading>Already contacted</Heading>
          <Message
            text={`You already reached ${card.dealer?.name ?? 'this dealer'} about this watch. Check your email for their reply.`}
          />
          <Button label="Done" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  if (sendInquiry.isSuccess) {
    const emailed = sendInquiry.data?.emailed ?? true;
    return (
      <Screen title="Contact dealer">
        <Centered>
          <Heading>{emailed ? 'Inquiry sent' : 'Preview only'}</Heading>
          <Message
            text={
              emailed
                ? `${card.dealer?.name ?? 'The dealer'} will get your message with a link to this watch.`
                : `Preview builds do not email dealers. In a live build, ${card.dealer?.name ?? 'the dealer'} would get your message with a link to this watch.`
            }
          />
          <Button label="Done" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  return (
    <Screen title="Contact dealer">
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.summary}>
          <Eyebrow>{card.brand}</Eyebrow>
          <Text style={styles.model}>{card.model ?? 'Unknown model'}</Text>
          <Message text={`Sold by ${card.dealer?.name ?? 'an unlisted dealer'}`} />
          {card.description ? (
            <Text style={styles.description}>{card.description}</Text>
          ) : null}
        </View>

        <Field
          value={message}
          onChangeText={setMessage}
          placeholder="Anything you want to ask? (optional)"
          multiline
          numberOfLines={4}
          autoCapitalize="sentences"
          style={styles.messageField}
        />

        <Message text="Graham sends the dealer your email and a link to this listing. You deal with them directly — no payment happens here." />

        {sendInquiry.error ? <Message text={sendInquiry.error.message} tone="error" /> : null}

        <View style={styles.actions}>
          <Button
            label={existing ? 'Retry inquiry' : 'Send inquiry'}
            loading={sendInquiry.isPending}
            onPress={() => sendInquiry.mutate({ card, message })}
          />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
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
