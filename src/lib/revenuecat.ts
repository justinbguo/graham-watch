import { Platform } from 'react-native';

import { isDemo } from '@/lib/demo';

/** Entitlement identifier in the RevenueCat dashboard. */
export const REVENUECAT_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'graham_pro';

/** Product identifiers attached to `graham_pro` in RevenueCat (Test Store or stores). */
export const REVENUECAT_PRODUCT_IDS = {
  monthly: 'monthly',
  yearly: 'yearly',
} as const;

function platformApiKey(): string | null {
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ?? null;
  }
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? null;
  }
  return null;
}

/**
 * Test Store keys (`test_…`) use one key for every platform. Production uses
 * `appl_…` / `goog_…` per platform, or the unified test key during development.
 */
export function revenueCatApiKey(): string {
  const unified = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  if (unified) return unified;

  const platform = platformApiKey();
  if (platform) return platform;

  throw new Error(
    'RevenueCat API key missing. Set EXPO_PUBLIC_REVENUECAT_API_KEY (Test Store) or EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY / EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY.'
  );
}

/** Native iOS/Android with any configured key; not demo or web. */
export function isRevenueCatEnabled(): boolean {
  if (isDemo || Platform.OS === 'web') return false;
  return Boolean(
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
      process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ||
      process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
  );
}

/** Last onboarding step before `onboarded_at`. */
export function shouldShowOnboardingPaywall(): boolean {
  return isRevenueCatEnabled();
}
