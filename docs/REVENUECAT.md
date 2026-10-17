# RevenueCat (Graham Pro)

Graham uses [RevenueCat](https://www.revenuecat.com/) for **billing and
entitlements** on iOS and Android (`react-native-purchases` only). The paywall
UI is **Graham code** (`GrahamPaywall`), not RevenueCat Paywalls.

Web and `EXPO_PUBLIC_DEMO=1` skip RevenueCat entirely.

## 1. Install

```bash
npx expo install react-native-purchases
```

Use a **development build** or store binary for real purchases. See [PHONE](PHONE.md).

## 2. Dashboard setup

In [RevenueCat](https://app.revenuecat.com):

1. **Project** → apps with bundle id `com.grahamwatch.app`.
2. **Entitlement** `graham_pro`.
3. **Products** `monthly` and `yearly`, attached to `graham_pro`. Target buyer
   pricing: **$30/month** and **$250/year** (configure in App Store Connect /
   Play Console; the paywall shows `priceString` when connected, with copy
   fallbacks until then).
4. **Offerings** → **current** offering with both packages.

You do not need a RevenueCat Paywall template for this app.

## 3. API keys

In `.env.local`:

```bash
EXPO_PUBLIC_REVENUECAT_API_KEY=test_xxxxxxxx
```

Production: `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` / `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` on EAS.

## 4. App map

| Piece | Location |
| --- | --- |
| SDK configure + `logIn(userId)` | `src/providers/revenuecat.tsx` |
| Entitlement + product ids | `src/lib/revenuecat.ts` |
| Offerings, purchase, restore | `src/data/subscriptions.ts` |
| Paywall UI | `src/features/subscriptions/GrahamPaywall.tsx` |
| Onboarding | `OnboardingPaywall` → `GrahamPaywall` |
| Settings / plans modal | `src/app/(app)/graham-pro.tsx` |
| Manage subscription | `Purchases.showManageSubscriptions()` |

### Entitlement

```ts
import { useGrahamPro } from '@/data/subscriptions';

const { data: status } = useGrahamPro();
if (status?.isActive) { /* graham_pro */ }
```

### Open paywall from code

```ts
import { router } from 'expo-router';
router.push('/graham-pro');
```

## 5. Verify

1. Set `EXPO_PUBLIC_REVENUECAT_API_KEY` in `.env.local`.
2. Dev client + `npm run start:dev`.
3. Finish onboarding or Settings → View plans.
4. Check RevenueCat → Customers.
