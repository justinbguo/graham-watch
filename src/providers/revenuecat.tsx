import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import type { CustomerInfo } from 'react-native-purchases';

import { cacheCustomerInfo } from '@/data/subscriptions';
import { isRevenueCatEnabled, revenueCatApiKey } from '@/lib/revenuecat';
import { useSession } from '@/providers/session';

/**
 * Configures RevenueCat once and keeps the purchaser tied to the Supabase user.
 * Web and demo skip configuration entirely.
 */
export function RevenueCatProvider({ children }: PropsWithChildren) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const configured = useRef(false);
  const linkedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isRevenueCatEnabled() || configured.current) return;
    configured.current = true;

    if (process.env.EXPO_OS === 'web') return;
    void import('react-native-purchases').then(({ default: Purchases, LOG_LEVEL }) => {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
      Purchases.configure({ apiKey: revenueCatApiKey() });
    });
  }, []);

  useEffect(() => {
    if (!isRevenueCatEnabled()) return;

    if (process.env.EXPO_OS === 'web') return;
    let remove = () => undefined;
    let alive = true;
    void import('react-native-purchases').then(({ default: Purchases }) => {
      if (!alive) return;
      const listener = (info: CustomerInfo) => {
        cacheCustomerInfo(queryClient, info);
      };
      Purchases.addCustomerInfoUpdateListener(listener);
      remove = () => {
        Purchases.removeCustomerInfoUpdateListener(listener);
      };
    });
    return () => {
      alive = false;
      remove();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isRevenueCatEnabled()) return;

    if (!userId) {
      if (linkedUserId.current) {
        linkedUserId.current = null;
        if (process.env.EXPO_OS === 'web') return;
        void import('react-native-purchases')
          .then(({ default: Purchases }) => Purchases.logOut())
          .catch(() => undefined);
      }
      return;
    }

    if (linkedUserId.current === userId) return;

    linkedUserId.current = userId;
    if (process.env.EXPO_OS === 'web') return;
    void import('react-native-purchases')
      .then(({ default: Purchases }) => Purchases.logIn(userId))
      .then(({ customerInfo }) => {
        cacheCustomerInfo(queryClient, customerInfo);
      })
      .catch(() => undefined);
  }, [queryClient, userId]);

  return children;
}
