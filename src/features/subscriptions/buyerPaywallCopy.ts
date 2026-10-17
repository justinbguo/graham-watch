/** Shown when RevenueCat has not returned store prices yet. */
export const BUYER_PLAN_FALLBACK = {
  monthly: { price: '$30', period: 'month' },
  yearly: { price: '$250', period: 'year', savingsVsMonthly: 110 },
} as const;

export const BUYER_PAYWALL = {
  title: 'Become a Collector',
  detail:
    'Membership unlocks dealer names, messaging, and buying. Free accounts can swipe, save watches, and use the Exchange.',
};
