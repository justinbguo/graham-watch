import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Message, Screen } from '@/components/ui';
import {
  useGrahamPro,
  useOfferings,
  usePurchasePackage,
  useRestorePurchases,
} from '@/data/subscriptions';
import { hasGrahamPro } from '@/features/subscriptions/entitlement';
import { subscriptionErrorMessage } from '@/features/subscriptions/errors';
import { BuyerPaywallPlans } from '@/features/subscriptions/BuyerPaywallPlans';
import { PaywallButton } from '@/features/subscriptions/PaywallButton';
import { BUYER_PAYWALL } from '@/features/subscriptions/buyerPaywallCopy';
import { buyerPaywallStyles } from '@/features/subscriptions/buyerPaywallStyles';
import { packagesFromOfferings } from '@/features/subscriptions/packages';
import { size, space } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/providers/theme';

type PlanId = 'monthly' | 'yearly';

export function GrahamPaywall({
  variant,
  error: externalError,
  loading: externalLoading,
  onDone,
  onBack,
}: {
  variant: 'onboarding' | 'standalone';
  error?: string | null;
  loading?: boolean;
  onDone: () => void;
  onBack?: () => void;
}) {
  const styles = useThemedStyles(buyerPaywallStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: status } = useGrahamPro();
  const offerings = useOfferings();
  const purchase = usePurchasePackage();
  const restore = useRestorePurchases();
  const [selected, setSelected] = useState<PlanId>('yearly');
  const [localError, setLocalError] = useState<string | null>(null);

  const plans = useMemo(() => {
    if (!offerings.data) return { monthly: null, yearly: null };
    return packagesFromOfferings(offerings.data);
  }, [offerings.data]);

  const selectedPackage: PurchasesPackage | null =
    selected === 'yearly' ? plans.yearly : plans.monthly;

  const busy = externalLoading || purchase.isPending || restore.isPending;
  const error =
    localError ??
    externalError ??
    (offerings.error ? subscriptionErrorMessage(offerings.error) : null) ??
    (purchase.error ? subscriptionErrorMessage(purchase.error) : null);

  useEffect(() => {
    if (variant === 'onboarding' && status?.isActive) onDone();
  }, [onDone, status?.isActive, variant]);

  const subscribe = () => {
    if (!selectedPackage) {
      setLocalError('Plans are not available yet. Try again in a moment.');
      return;
    }
    setLocalError(null);
    purchase.mutate(selectedPackage, {
      onSuccess: () => onDone(),
      onError: (caught) => setLocalError(subscriptionErrorMessage(caught)),
    });
  };

  const restorePurchases = () => {
    setLocalError(null);
    restore.mutate(undefined, {
      onSuccess: (info) => {
        if (hasGrahamPro(info)) onDone();
      },
      onError: (caught) => setLocalError(subscriptionErrorMessage(caught)),
    });
  };

  const skipLabel = variant === 'onboarding' ? 'Continue free' : 'Close';

  return (
    <Screen>
      <View
        style={[
          styles.page,
          styles.footerPad,
          { paddingBottom: insets.bottom + space.sm },
        ]}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityState={{ disabled: busy }}
            hitSlop={space.sm}
            disabled={busy}
            onPress={onBack}
            style={({ pressed }) => [
              styles.back,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}>
            <MaterialCommunityIcons name="arrow-left" size={size.icon} color={theme.color.text} />
          </Pressable>
        ) : null}
        <Text style={styles.title}>{BUYER_PAYWALL.title}</Text>
        <Text style={styles.detail}>{BUYER_PAYWALL.detail}</Text>
        {offerings.isPending ? <Message text="Loading plans…" /> : null}
        <BuyerPaywallPlans
          monthly={plans.monthly}
          yearly={plans.yearly}
          selected={selected}
          onSelect={setSelected}
        />
        {error ? <Message text={error} tone="error" /> : null}
        <View style={styles.actions}>
          <PaywallButton
            block
            solid
            label="Subscribe"
            busy={purchase.isPending}
            disabled={!selectedPackage || busy}
            onPress={subscribe}
          />
          <PaywallButton
            block
            label="Restore purchases"
            busy={restore.isPending}
            disabled={busy}
            onPress={restorePurchases}
          />
          <PaywallButton block label={skipLabel} disabled={busy} onPress={onDone} />
        </View>
      </View>
    </Screen>
  );
}
