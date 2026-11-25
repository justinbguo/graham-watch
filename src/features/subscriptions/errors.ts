const purchaseErrorCode = {
  cancelled: '1',
  storeProblem: '2',
  notAllowed: '3',
  unavailable: '5',
  network: '10',
} as const;

/** Map RevenueCat errors to copy safe to show in the app. */
export function subscriptionErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Something went wrong with your subscription. Try again.';
  }

  const purchaseError = error as { code?: string; message?: string };
  const code = purchaseError.code;

  if (code === purchaseErrorCode.cancelled) {
    return 'Purchase cancelled.';
  }
  if (code === purchaseErrorCode.storeProblem) {
    return 'The App Store or Play Store could not complete the purchase. Try again later.';
  }
  if (code === purchaseErrorCode.network) {
    return 'Check your connection and try again.';
  }
  if (code === purchaseErrorCode.unavailable) {
    return 'This plan is not available right now.';
  }
  if (code === purchaseErrorCode.notAllowed) {
    return 'Purchases are not allowed on this device.';
  }

  return purchaseError.message || 'Something went wrong with your subscription. Try again.';
}
