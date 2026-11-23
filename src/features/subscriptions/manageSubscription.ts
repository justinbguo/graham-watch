import { isRevenueCatEnabled } from '@/lib/revenuecat';

import { subscriptionErrorMessage } from './errors';

/** Opens the App Store or Play Store subscription management sheet. */
export async function openSubscriptionManagement(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  if (!isRevenueCatEnabled()) {
    return { ok: false, message: 'Subscription management is only available in the mobile app.' };
  }

  try {
    if (process.env.EXPO_OS === 'web') {
      return { ok: false, message: 'Subscription management is only available in the mobile app.' };
    }
    const { default: Purchases } = await import('react-native-purchases');
    await Purchases.showManageSubscriptions();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: subscriptionErrorMessage(error) };
  }
}
