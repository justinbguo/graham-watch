# Authentication

Graham signs people in four ways, three of which exist today.

| Method | State | Gives us an email | Works in Expo Go |
| --- | --- | --- | --- |
| Email code | Live | Yes, it is the identity | Yes |
| Google | Written, needs credentials | Yes, verified | Yes |
| Apple | Written. Native button on iPhone; our door everywhere else | Yes, real or a relay address | The door shows. The native button does not |
| Phone | Not built | No | Yes |

An email is not a detail. `send-inquiry` uses the buyer's address as the
reply-to, so it is the only way a dealer can answer. A sign-in method that
carries no email produces an account that can swipe and save but cannot do the
one thing the app is for. That is why phone is last and why it cannot ship on
its own — see "Phone" below.

## Guest browsing

Web opens on the deck without an account. Guests get the same Buy surface —
search, filters, grid or cards — with **Log in** at the top right. Judgments
live on the device for `GUEST_SWIPE_BUDGET` (10) swipes; the eleventh opens the
sign-in sheet. Community, messages, wishlist, and profile ask for an account up
front. Anon may read the approved catalogue (and run `search_listings` /
`listing_counts`); swipes and everything personal stay authenticated. Local
guest judgments flush into `swipes` once a session lands.

iOS does not browse as a guest. The first screen is the sign-in wall, and the
deck mounts only after a session exists. There is no **Log in** control in the
header, because that slot is already the undo, filter, and view controls.

## Create an account, or log in

On web, sign-in is a sheet over the app. On iOS, it is the wall in front of
the app. Both open on creating an account. The doors read `Create account
with`, and a line under them flips the doors to `Log in with`. Apple and
Google behave the same in both — Supabase creates or finds the user from the
verified address. Email is where the modes differ: creating sends
`shouldCreateUser: true`, logging in sends `false`, so an address with no
account gets "No account uses that address yet" instead of a silent new
account under a typo. GoTrue reports that case as a 422 with `Signups not
allowed for otp`; `sendEmailCode` rewrites it.

## Email code

`signInWithOtp` sends a one-use six digit code (and a fallback link). The app
submits the code with `verifyOtp`. That is the confirmation: `email_confirmed_at`
is set only after the code is spent, which is what stops a stranger signing up as
a shop's published address and claiming it.

Locally the mail lands in Mailpit at http://127.0.0.1:54324. When the app is
pointed at that local stack, it reads the code from Mailpit and verifies it so
sign-in never leaves the screen. A hosted project never does this — the gate is
the Supabase URL host, not whether Metro is in development mode.

The browser will not call Mailpit itself: a different port is a different site,
and Mailpit does not grant the page permission to read it. On web, the page
asks Metro (`/__dev-inbox`), and Metro reads Mailpit. The phone skips that hop.

`127.0.0.1` on a phone is the phone, so the client copies the LAN address Metro
used to deliver the bundle (`src/lib/localHost.ts`). Phone and Mac have to be
on the same Wi-Fi. The code still does not go to a real inbox.

## Which server am I on?

Graham has **two** Supabase projects: **local** (Docker on your Mac) and
**hosted** (production). Users and passwords do **not** sync between them.

| Check | Command or UI |
| --- | --- |
| Terminal | `npm run env` or `npm run backend` — lists app, scripts, operator UI |
| Before Metro starts | `npm run check:env` prints `app → local` or `app → hosted · …` |
| In the app | Sign-in shows a one-line backend label; **Settings → Backend** has the full hint |
| Switch | `npm run env -- local` or `npm run env -- hosted`, then **restart Metro** |

**"No account uses that address"** while logging in usually means one of:

1. **Wrong mode** — you chose **Log in** but never created that email on *this*
   server. Use **Create account** once, or use a fixture (`npm run mock:users` on local).
2. **Wrong server** — the account exists on hosted but the app points at local
   (or the opposite). Match Settings → Backend to where you signed up.
3. **Local reset** — `npm run db:reset` deletes every local auth user. Run
   `npm run mock:users` again or create the account again.

### Fixture `gold@graham.test` on hosted

`@graham.test` addresses do not receive real mail on hosted. After seeding:

```
npm run env -- hosted
npm run mock:users -- --yes --gold-only
npm run mock:signin -- gold@graham.test
```

Paste the printed six-digit code in the app (**Log in with email**). Requires
`SUPABASE_SERVICE_ROLE_KEY` in `scripts/.env.operator.local`. Goldfinger's shop
must already exist in that project (import + approve if not seeded).

## Google

The code is written and inert. It turns on when the credentials exist.

### 1. Create the OAuth client

1. Open https://console.cloud.google.com/apis/credentials and pick or create a
   project.
2. Configure the OAuth consent screen once: External, app name "Graham", your
   address for support and developer contact. Leave it in Testing and add your
   own Google account under Test users — publishing is only needed to let
   strangers in.
3. Credentials → Create credentials → OAuth client ID → **Web application**.
   Not "iOS". The flow goes through Supabase's callback, so Google is talking to
   a web server, not to the phone.
4. Under Authorised redirect URIs add:

   ```
   http://localhost:54321/auth/v1/callback
   ```

   Use `localhost`, not `127.0.0.1`. Google treats those as different strings,
   and the Cloud Console often refuses to save a raw IP. The local stack is
   already told to send this exact URI (`[auth.external.google].redirect_uri`).
   A hosted project needs its own client, with
   `https://<project-ref>.supabase.co/auth/v1/callback`.

### 2. Put them in the repo-root `.env`

Not `supabase/functions/.env` — that file is for edge-function secrets.
`supabase start` and Expo both read the `.env` next to `package.json`.

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-...
EXPO_PUBLIC_GOOGLE_SIGN_IN=1
```

Then `npm run db:stop && npm run db:start`, because `supabase start` reads the
environment once at boot, and restart Expo so the client picks up the new
`EXPO_PUBLIC_` variable.

`[auth.external.google]` is already `enabled = true` in `config.toml`. With an
empty client id the provider is inert rather than broken, which is why the
switch that matters is `EXPO_PUBLIC_GOOGLE_SIGN_IN` — it decides whether the
button is on screen at all. A visible button that always fails is worse than no
button.

### Why the web flow and not the native Google SDK

`@react-native-google-signin/google-signin` shows the native account sheet and
is the nicer experience, but it is a native module: Expo Go cannot load it, so
adopting it means a development build before anyone can sign in at all. The
`signInWithOAuth` + `expo-web-browser` flow we use opens a system browser sheet,
works in Expo Go today, and is the same code path on a real build. Revisit it
when there is a dev build for other reasons.

### Redirect URLs

`makeRedirectUri()` returns `exp://<host>:<metro-port>/--/...` in Expo Go and
`graham://` in a real build. A redirect Auth does not accept is not reported as
an error — it silently falls back to `site_url`, which on screen is the browser
sheet closing with nothing having happened.

These were measured against the local stack by sending a magic link for each and
following where it redirected, rather than read off the matching rules:

| Redirect | Accepted | Why |
| --- | --- | --- |
| `exp://127.0.0.1:<any port>/...` | Yes | Loopback is allowed without being listed |
| `exp://localhost:8083` | Yes | From the `exp://localhost:*` entry |
| `exp://localhost:8083/--/x` | Yes | Needs the separate `/**` entry |
| `exp://192.168.x.x:8083` | **No** | Refused however it is written. Expo Go emits this unless `preferLocalhost` is set; Auth then falls back to `graham://` and Safari says the address is invalid. |
| `graham://`, `graham://auth/cb` | Yes | The app's own scheme |

Two consequences. The simulator needs no configuration, because Metro's port
never matters on loopback. And **Google sign-in cannot be tested from a physical
phone against the local stack** — a LAN redirect is refused even when listed
exactly. Use the simulator, or point the phone at a hosted project whose
allow-list you control.

Matching is glob with `.` and `/` as separators, so `*` stops at a slash. Any
host:port entry you add needs a `/**` twin or it will cover the bare URL and not
the one Expo Go actually sends.

## Apple

On an iPhone, `signInWithApple` uses `expo-apple-authentication`, which hands
Supabase an identity token directly with no browser round trip. That view does
not exist in a browser or in Expo Go, so `isAppleSignInAvailable()` is false
there and the screen draws our own door instead. That door opens Apple in the
browser, the same round trip as Google, and it does nothing until
`[auth.external.apple]` is enabled with a Services ID. The native button
starts working on the first development build, no further code change.

Apple sends the user's name on the very first sign-in and never again, so
`signInWithApple` writes it to `profiles` immediately. Losing that moment means
the name is gone for good.

## Phone

Not built. Two reasons, either of which is enough.

**A phone number is not a reply-to.** A phone-only account can swipe, save, and
then fail at the inquiry, which is the whole funnel. Shipping phone means also
asking those users for an email during onboarding — so it adds a step rather
than removing one.

**Two sign-ins become two accounts.** Supabase links identities when the email
matches and the provider verified it. A phone has no email to match on, so
signing in with Google in March and a phone number in April produces two users,
two wishlists, and two swipe histories, with nothing on screen explaining it.

If it is ever revisited: use **Twilio Verify**, not plain Twilio SMS. Verify is
built for one-time codes and is exempt from US A2P 10DLC registration. Locally
none of that is needed — `[auth.sms.test_otp]` maps fixed numbers to fixed
codes, so the flow can be built and tested with no provider and no spend.

## First-run onboarding

After the session exists, onboarding asks for a name, a username, a birthday
(18+), a collection size, favorite brands, and the pain points they face while
searching for vintage watches. It does not ask whether they buy or sell.
Everyone finishes as a buyer. A shop is claimed from Profile. The username is
`profiles.handle`, claimed on that slide by `claim_username` so a taken name
is refused before the rest of the questions. The last slide is notifications.

Continue on that slide requests the real OS permission on iOS and Android;
Not now finishes without it. Android creates the `watch-updates` channel first,
which Android 13 requires before it will show a prompt. Web finishes with the
permission off because `expo-notifications` has no browser permission API.
`notifications_enabled` records the result, not merely what the user said they
wanted. It is not a push token, so remote delivery remains separate work.

Someone under 18 cannot stamp `onboarded_at`. The database trigger is the gate;
the blocked screen only signs them out.

## Deleting an account

Settings → Delete account. Apple requires this to live in the app if Sign in
with Apple is offered, even while that button is still hidden in Expo Go.

The app cannot delete an `auth.users` row: the key it ships is public. It calls
`delete_own_account`, a function that runs as the database owner but only for
`auth.uid()`, so you can erase yourself and nobody else. The profile, swipes,
and inquiries cascade from that row. A shop they claimed or imported stays
listed and becomes unclaimed — the catalogue is not a login.

The avatar file is removed by the client first, through the Storage API, because
Storage refuses a `delete from storage.objects` in SQL and raises 42501 — which
rolled the whole function back and made every deletion fail. A failure removing
the file is swallowed: an orphaned photo beats an account that cannot be closed.
