# Authentication

Graham signs people in four ways, three of which exist today.

| Method | State | Gives us an email | Works in Expo Go |
| --- | --- | --- | --- |
| Email code | Live | Yes, it is the identity | Yes |
| Google | Written, needs credentials | Yes, verified | Yes |
| Apple | Written, needs a dev build | Yes, real or a relay address | No |
| Phone | Not built | No | Yes |

An email is not a detail. `send-inquiry` uses the buyer's address as the
reply-to, so it is the only way a dealer can answer. A sign-in method that
carries no email produces an account that can swipe and save but cannot do the
one thing the app is for. That is why phone is last and why it cannot ship on
its own — see "Phone" below.

## Email code

`signInWithOtp` then `verifyOtp`. Six digits, no password, no link to click.
Locally the mail lands in Mailpit at http://127.0.0.1:54324 rather than a real
inbox, so you can sign in without an SMTP provider.

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
4. Under Authorised redirect URIs add both:

   ```
   http://127.0.0.1:54321/auth/v1/callback
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   The second one only matters once there is a hosted project.

### 2. Put them in `.env`

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
| `exp://192.168.x.x:8083` | **No** | Refused however it is written |
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

Implemented in `signInWithApple` using `expo-apple-authentication`, which hands
Supabase an identity token directly with no browser round trip. It is a native
module, so `isAppleSignInAvailable()` returns false in Expo Go and the button
hides itself. It starts working on the first development build, no code change.

Apple sends the user's name on the very first sign-in and never again, so
`signInWithApple` writes it to `profiles` immediately. Losing that moment means
the name is gone for good.

## Phone

Not built, and not planned. Two reasons, either of which is enough.

**A phone number is not a reply-to.** A phone-only account can swipe, save, and
then fail at the inquiry, which is the whole funnel. Shipping phone means also
asking those users for an email during onboarding — so it adds a step rather
than removing one.

**Two sign-ins become two accounts.** Supabase links identities when the email
matches and the provider verified it. A phone has no email to match on, so
signing in with Google in March and a phone number in April produces two users,
two Saved lists, and two swipe histories, with nothing on screen explaining it.

Google and Apple already hand over a verified address, so neither reason applies
to them. Phone would add a step and a bill to buy nothing.

If it is ever revisited: use **Twilio Verify**, not plain Twilio SMS. Verify is
built for one-time codes and is exempt from US A2P 10DLC brand and campaign
registration, which otherwise costs $19.50–$61 up front, $1.50–$10 a month, and
2–7 business days of carrier review that needs an EIN and a live privacy policy.
Locally none of that is needed — `[auth.sms.test_otp]` maps fixed numbers to
fixed codes, so the flow can be built and tested with no provider and no spend.
