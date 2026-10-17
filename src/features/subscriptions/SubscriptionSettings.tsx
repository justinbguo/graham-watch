import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Divider, Eyebrow, Message } from '@/components/ui';
import { useGrahamPro, useRestorePurchases } from '@/data/subscriptions';
import { subscriptionErrorMessage } from '@/features/subscriptions/errors';
import { openSubscriptionManagement } from '@/features/subscriptions/manageSubscription';
import { isRevenueCatEnabled } from '@/lib/revenuecat';
import { stack, type, type Theme } from '@/lib/theme';
import { useThemedStyles } from '@/providers/theme';

export function SubscriptionSettings() {
  const styles = useThemedStyles(subscriptionStyles);
  const { data: status, isPending, error, refetch } = useGrahamPro();
  const restore = useRestorePurchases();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isRevenueCatEnabled()) {
    if (!__DEV__) return null;
    return (
      <>
        <Divider />
        <View style={styles.section}>
          <Eyebrow>Collector membership</Eyebrow>
          <Message
            text="Subscriptions are off. Add EXPO_PUBLIC_REVENUECAT_API_KEY to .env and restart Metro."
          />
        </View>
      </>
    );
  }

  const planLabel =
    status?.productIdentifier === 'yearly'
      ? 'Yearly'
      : status?.productIdentifier === 'monthly'
        ? 'Monthly'
        : status?.productIdentifier;

  const openManagement = async () => {
    setActionError(null);
    setBusy(true);
    const outcome = await openSubscriptionManagement();
    setBusy(false);
    if (!outcome.ok) {
      setActionError(outcome.message);
      return;
    }
    await refetch();
  };

  const restorePurchases = () => {
    setActionError(null);
    restore.mutate(undefined, {
      onError: (caught) => setActionError(subscriptionErrorMessage(caught)),
      onSuccess: () => void refetch(),
    });
  };

  return (
    <>
      <Divider />
      <View style={styles.section}>
        <Eyebrow>Collector membership</Eyebrow>
        {isPending ? (
          <Message text="Checking your subscription…" />
        ) : error ? (
          <Message text={subscriptionErrorMessage(error)} tone="error" />
        ) : status?.isActive ? (
          <>
            <Text style={styles.status}>
              {planLabel ? `${planLabel} plan` : 'Active'}
              {status.expirationDate
                ? status.willRenew
                  ? ` · renews ${formatDate(status.expirationDate)}`
                  : ` · ends ${formatDate(status.expirationDate)}`
                : ''}
            </Text>
            <Button
              label="Manage subscription"
              variant="outline"
              loading={busy}
              onPress={() => void openManagement()}
            />
          </>
        ) : (
          <>
            <Message
              text="Unlock dealer names, messaging, and buying. Free members can swipe, save, and use the Exchange."
            />
            <Button label="View collector plans" onPress={() => router.push('/graham-pro')} />
          </>
        )}
        <Button
          label="Restore purchases"
          variant="ghost"
          loading={restore.isPending}
          disabled={busy}
          onPress={restorePurchases}
        />
        {actionError ? <Message text={actionError} tone="error" /> : null}
        {restore.error ? <Message text={subscriptionErrorMessage(restore.error)} tone="error" /> : null}
      </View>
    </>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const subscriptionStyles = (theme: Theme) => ({
  section: {
    gap: stack.related,
  },
  status: {
    ...type.body,
    color: theme.color.textMuted,
  },
});
