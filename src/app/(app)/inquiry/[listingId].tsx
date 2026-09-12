import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Centered, Field, Message, Screen, Spinner } from '@/components/ui';
import { useSendInquiry } from '@/data/inquiries';
import { useListing } from '@/data/listings';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function InquiryScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const { data: card, isPending } = useListing(listingId);
  const [message, setMessage] = useState('');
  const sendInquiry = useSendInquiry(userId);

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
          <Text style={styles.heading}>Inquiry sent</Text>
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
          <Text style={styles.brand}>{card.brand}</Text>
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
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    padding: theme.space(2),
    gap: theme.space(2),
  },
  summary: {
    gap: 2,
  },
  brand: {
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.muted,
  },
  model: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.color.text,
  },
  messageField: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  actions: {
    marginTop: 'auto',
    gap: theme.space(1),
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.color.text,
  },
});
