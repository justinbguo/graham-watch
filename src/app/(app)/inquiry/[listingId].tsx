import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Button, Centered, Eyebrow, Field, Heading, Message, Screen, Spinner } from '@/components/ui';
import { useSendInquiry } from '@/data/inquiries';
import { useListing } from '@/data/listings';
import { space, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';
import { useSession } from '@/providers/session';

export default function InquiryScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const [message, setMessage] = useState('');
  const sendInquiry = useSendInquiry(userId);
  const styles = useThemedStyles(inquiryStyles);

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

  if (sendInquiry.isSuccess) {
    return (
      <Screen title="Contact dealer">
        <Centered>
          <Heading>Inquiry sent</Heading>
          <Message
            text={`${card.dealer?.name ?? 'The dealer'} will get your message with a link to this watch.`}
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
            label="Send inquiry"
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
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.lg,
  },
  summary: {
    gap: space.xs,
  },
  model: {
    ...type.title,
    color: theme.color.text,
  },
  messageField: {
    minHeight: 128,
    textAlignVertical: 'top' as const,
  },
  actions: {
    marginTop: 'auto' as const,
    gap: space.sm,
  },
});
