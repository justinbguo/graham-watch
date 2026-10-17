import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

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

    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({ apiKey: revenueCatApiKey() });
  }, []);

  useEffect(() => {
    if (!isRevenueCatEnabled()) return;

    const listener = (info: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>) => {
      cacheCustomerInfo(queryClient, info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!isRevenueCatEnabled()) return;

    if (!userId) {
      if (linkedUserId.current) {
        linkedUserId.current = null;
        void Purchases.logOut().catch(() => undefined);
      }
      return;
    }

    if (linkedUserId.current === userId) return;

    linkedUserId.current = userId;
    void Purchases.logIn(userId)
      .then(({ customerInfo }) => {
        cacheCustomerInfo(queryClient, customerInfo);
      })
      .catch(() => undefined);
  }, [queryClient, userId]);

  return children;
}
