import { PURCHASES_ERROR_CODE, type PurchasesError } from 'react-native-purchases';

/** Map RevenueCat errors to copy safe to show in the app. */
export function subscriptionErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Something went wrong with your subscription. Try again.';
  }

  const purchaseError = error as PurchasesError;
  const code = purchaseError.code;

  if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return 'Purchase cancelled.';
  }
  if (code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR) {
    return 'The App Store or Play Store could not complete the purchase. Try again later.';
  }
  if (code === PURCHASES_ERROR_CODE.NETWORK_ERROR) {
    return 'Check your connection and try again.';
  }
  if (code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) {
    return 'This plan is not available right now.';
  }
  if (code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR) {
    return 'Purchases are not allowed on this device.';
  }

  return purchaseError.message || 'Something went wrong with your subscription. Try again.';
}
