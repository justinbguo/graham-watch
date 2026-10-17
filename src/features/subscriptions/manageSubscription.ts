import Purchases from 'react-native-purchases';

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
    await Purchases.showManageSubscriptions();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: subscriptionErrorMessage(error) };
  }
}
