import type { PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';

import { REVENUECAT_PRODUCT_IDS } from '@/lib/revenuecat';

export type GrahamProPackages = {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
};

function findPackage(packages: PurchasesPackage[], productId: string): PurchasesPackage | null {
  return (
    packages.find(
      (item) => item.product.identifier === productId || item.identifier === productId
    ) ?? null
  );
}

export function packagesFromOfferings(offerings: PurchasesOfferings): GrahamProPackages {
  const available = offerings.current?.availablePackages ?? [];
  return {
    monthly: findPackage(available, REVENUECAT_PRODUCT_IDS.monthly),
    yearly: findPackage(available, REVENUECAT_PRODUCT_IDS.yearly),
  };
}

export function planLabel(pkg: PurchasesPackage): string {
  const id = pkg.product.identifier;
  if (id === REVENUECAT_PRODUCT_IDS.yearly) return 'Yearly';
  if (id === REVENUECAT_PRODUCT_IDS.monthly) return 'Monthly';
  return pkg.product.title || id;
}

export function planPrice(pkg: PurchasesPackage): string {
  return pkg.product.priceString;
}
