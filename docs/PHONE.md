# Phone installs

Install Graham on a real phone without keeping a laptop nearby. **EAS Build**
(Expo Application Services) compiles the app in the cloud and gives you an
install link. That replaces Metro on your machine and Expo Go on the phone.

## Which profile

| Profile | What you get | Backend |
| --- | --- | --- |
| `preview` | Install link (Android APK, iOS ad hoc) | The EAS environment named `production` — the hosted Supabase project |
| `production` | Store / TestFlight build. Build number increments on Expo's servers. | The same `production` environment |

Start with `preview` when you want an install link before TestFlight. It is a
real build against hosted Supabase, not the fixture mode from `npm run demo`.

## One-time setup (needs a computer once)

1. Create a free account at https://expo.dev and install the CLI:

   ```
   npm install
   npx eas-cli@latest login
   npx eas-cli@latest build:configure
   ```

   That writes an Expo project id into `app.json`. Commit that change.

2. **Android** — nothing else. The free Expo plan can build an APK.

3. **iPhone** — you need the paid [Apple Developer Program](https://developer.apple.com/programs/)
   (~$99/year). Without it Apple will not let a custom build onto a physical
   iPhone. Expo Go is the only free iPhone path, and it needs a running Metro
   server.

## Build and install

```
npx eas-cli@latest build --profile preview --platform android
# or, with an Apple Developer account:
npx eas-cli@latest build --profile preview --platform ios
```

When the build finishes, open the link on the phone (or scan the QR on the
build page) and install.

- **Android:** allow installs from the browser if prompted. No Play Store needed.
- **iPhone (ad hoc):** register the device first with
  `npx eas-cli@latest device:create`, then rebuild so your UDID is in the
  provisioning profile. Prefer TestFlight once you are submitting
  `production` builds — fewer device-list rebuilds.

The install stays on the phone. You do not need the laptop running afterward.

## Production (real data)

Point a hosted Supabase project at the app, then set EAS secrets (Project →
Environment variables on expo.dev, or `eas env:create`):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Do **not** set `EXPO_PUBLIC_DEMO` on `production`. `eas.json` also forces it to
`0` for `preview` and `production`, so a store binary cannot become the fixture
app by accident. Then:

### Subscriptions (RevenueCat)

In-app purchases need a **development build** (`npm run start:dev` or an EAS
build). Expo Go runs RevenueCat in preview mode only; real purchases need a dev
client or store binary.

1. Create a RevenueCat project and add the iOS and Android apps (bundle id
   `com.grahamwatch.app`).
2. In RevenueCat Test Store (or App Store Connect / Play later), add products
   `monthly` and `yearly`, attach them to entitlement **`graham_pro`**, and set a
   **current** offering with a paywall.
3. Set keys on EAS or `.env.local`:

   ```
   EXPO_PUBLIC_REVENUECAT_API_KEY=test_...   # Test Store
   # or production:
   EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=appl_...
   EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_...
   ```

   See [REVENUECAT](REVENUECAT.md).

Without those keys, onboarding skips the paywall and finishes after
notifications (same as web).

```
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios
```

`eas submit` uploads the `.ipa` to App Store Connect. Testers install it from
the TestFlight app. App Store review is a later click, not this one.

`preview` is the ad hoc install (register each iPhone with
`npx eas-cli@latest device:create`, then rebuild). Use it only when you need a
binary before the App Store Connect record exists. TestFlight is the path for
real testers.

### Checklist before the first TestFlight

Do these in order. The app code is already wired; each line is something only
you can click.

1. Enroll in the Apple Developer Program. Create the App Store Connect app
   with bundle id `com.grahamwatch.app`.
2. Confirm the EAS production environment points at hosted Supabase, not your
   laptop. These two are public (they ship inside the app) and must be the
   hosted pair:

   ```
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://hbxgxtbtefpyutyqafoi.supabase.co --environment production --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <hosted anon key> --environment production --visibility plaintext
   ```

   `eas env:list --environment production` is the check. `preview` reads this
   same environment. Never put the service-role key here.

3. Sign in with Apple, in Apple Developer and in the Supabase dashboard.
   The steps, including the Client IDs order and the six-month secret, are in
   [AUTH](AUTH.md#apple).

4. Push notifications. On the first iOS build, EAS asks for an APNs key.
   Create one in Apple Developer → Keys → Apple Push Notifications service,
   download the `.p8` once, and let EAS store it
   (`npx eas-cli@latest credentials -p ios`). Leave Expo's "enhanced push
   security" off — the database sends through Expo's public push API, and that
   switch would reject the calls. Apply the new migration to hosted
   (`npx supabase db push`) before testers message each other, or replies will
   save and no phone will ring.

5. Optional. Analytics: `EXPO_PUBLIC_POSTHOG_KEY` (and
   `EXPO_PUBLIC_POSTHOG_HOST` if the project is not in the US cloud) on the
   production environment. Crashes: `EXPO_PUBLIC_SENTRY_DSN`. Neither key
   means the app simply does not send. The Sentry value reports JavaScript
   crashes. Native crashes, the kind that kill the app before JavaScript
   runs, need `@sentry/react-native` later — that plugin refuses to build
   until a Sentry org and an auth token exist, so it is not in this binary.

6. Build and submit:

   ```
   npx eas-cli@latest build --profile production --platform ios
   npx eas-cli@latest submit --profile production --platform ios
   ```

   In App Store Connect, answer the encryption question as exempt (the binary
   already sets `ITSAppUsesNonExemptEncryption` to false), add yourself as a
   TestFlight tester, and install from the TestFlight app.

## Beginner trap

A build that still points at `http://127.0.0.1:54321` will open, then fail
every query — on a phone, localhost is the phone itself. Both `preview` and
`production` read the EAS environment named `production`. That environment
needs the hosted Supabase URL, not the laptop's localhost.
