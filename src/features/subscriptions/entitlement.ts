import type { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases';

import { REVENUECAT_ENTITLEMENT_ID } from '@/lib/revenuecat';

export function grahamProEntitlement(
  info: CustomerInfo
): PurchasesEntitlementInfo | null {
  return info.entitlements.active[REVENUECAT_ENTITLEMENT_ID] ?? null;
}

export function hasGrahamPro(info: CustomerInfo): boolean {
  return grahamProEntitlement(info) !== null;
}
