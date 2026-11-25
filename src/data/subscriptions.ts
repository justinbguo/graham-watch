import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { grahamProEntitlement, hasGrahamPro } from '@/features/subscriptions/entitlement';
import { isRevenueCatEnabled } from '@/lib/revenuecat';

import { keys } from './keys';

export type GrahamProStatus = {
  isActive: boolean;
  /** ISO expiration from RevenueCat, if subscribed. */
  expirationDate: string | null;
  willRenew: boolean;
  productIdentifier: string | null;
};

function statusFromCustomerInfo(info: CustomerInfo): GrahamProStatus {
  const entitlement = grahamProEntitlement(info);
  return {
    isActive: entitlement !== null,
    expirationDate: entitlement?.expirationDate ?? null,
    willRenew: entitlement?.willRenew ?? false,
    productIdentifier: entitlement?.productIdentifier ?? null,
  };
}

async function nativePurchases() {
  if (process.env.EXPO_OS === 'web') {
    throw new Error('RevenueCat runs in the iOS and Android app.');
  }
  const { default: Purchases } = await import('react-native-purchases');
  return Purchases;
}

async function loadCustomerInfo(): Promise<CustomerInfo> {
  const Purchases = await nativePurchases();
  return Purchases.getCustomerInfo();
}

export function useCustomerInfo() {
  const enabled = isRevenueCatEnabled();

  return useQuery({
    queryKey: keys.customerInfo(),
    queryFn: loadCustomerInfo,
    enabled,
    staleTime: 60_000,
  });
}

/** Whether the signed-in user has the `graham_pro` entitlement. */
export function useOfferings() {
  const enabled = isRevenueCatEnabled();

  return useQuery({
    queryKey: keys.offerings(),
    queryFn: async () => (await nativePurchases()).getOfferings(),
    enabled,
    staleTime: 300_000,
  });
}

export function useGrahamPro() {
  const enabled = isRevenueCatEnabled();

  return useQuery({
    queryKey: keys.subscription(),
    queryFn: async () => {
      const info = await loadCustomerInfo();
      return statusFromCustomerInfo(info);
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useRestorePurchases() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => (await nativePurchases()).restorePurchases(),
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(keys.customerInfo(), customerInfo);
      queryClient.setQueryData(keys.subscription(), statusFromCustomerInfo(customerInfo));
    },
  });
}

export function usePurchasePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const Purchases = await nativePurchases();
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(keys.customerInfo(), customerInfo);
      queryClient.setQueryData(keys.subscription(), statusFromCustomerInfo(customerInfo));
    },
  });
}

/** Sync TanStack cache after RevenueCat pushes new customer info. */
export function cacheCustomerInfo(
  queryClient: ReturnType<typeof useQueryClient>,
  customerInfo: CustomerInfo
) {
  queryClient.setQueryData(keys.customerInfo(), customerInfo);
  queryClient.setQueryData(keys.subscription(), statusFromCustomerInfo(customerInfo));
}

export function readGrahamProFromInfo(info: CustomerInfo): boolean {
  return hasGrahamPro(info);
}
