# Phone installs

Install Graham on a real phone without keeping a laptop nearby. **EAS Build**
(Expo Application Services) compiles the app in the cloud and gives you an
install link. That replaces Metro on your machine and Expo Go on the phone.

## Which profile

| Profile | What you get | Backend |
| --- | --- | --- |
| `preview` | Install link (Android APK, iOS ad hoc / TestFlight path) | Demo fixtures — no Supabase |
| `production` | Store build | Hosted Supabase (`EXPO_PUBLIC_*` secrets on EAS) |

Start with `preview`. It is the same UI path as `npm run demo`, packaged as a
real app.

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

Do **not** set `EXPO_PUBLIC_DEMO` on `production`. Then:

```
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios    # TestFlight
```

## Beginner trap

A `preview` build that still points at `http://127.0.0.1:54321` will open, then
fail every query — on a phone, localhost is the phone itself. The `preview`
profile sets `EXPO_PUBLIC_DEMO=1` so that cannot happen. If you hand-roll a
profile, either keep demo on or use a hosted Supabase URL.
