import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Centered, Field, Message, Screen } from '@/components/ui';
import type { DeckCard } from '@/lib/database.types';
import { fetchListing, sendInquiry } from '@/lib/queries';
import { theme } from '@/lib/theme';
import { useSession } from '@/providers/session';

export default function InquiryScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { userId } = useSession();
  const [card, setCard] = useState<DeckCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchListing(listingId)
      .then(setCard)
      .catch(() => setError('Could not load this watch.'))
      .finally(() => setLoading(false));
  }, [listingId]);

  const send = async () => {
    if (!userId || !card) return;
    setSending(true);
    setError(null);
    try {
      await sendInquiry(userId, card, message);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your inquiry.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Screen title="Contact dealer">
        <Centered>
          <ActivityIndicator />
        </Centered>
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen title="Contact dealer">
        <Centered>
          <Message text={error ?? 'That watch is no longer available.'} tone="error" />
          <Button label="Close" variant="secondary" onPress={() => router.back()} />
        </Centered>
      </Screen>
    );
  }

  if (sent) {
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

        {error ? <Message text={error} tone="error" /> : null}

        <View style={styles.actions}>
          <Button label="Send inquiry" loading={sending} onPress={send} />
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
