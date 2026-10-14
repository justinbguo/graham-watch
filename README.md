# Graham

Swipe-based discovery app for vintage watches. Buyers swipe a deck and save what they
like. Dealer inventory is imported by an operator, not by users.

Expo (SDK 57) + React Native + Expo Router, Supabase for auth, Postgres, and
edge functions.

- Operating guide: [docs/OPERATING.md](docs/OPERATING.md)
- Making a change: [docs/DEVELOPING.md](docs/DEVELOPING.md)
- Phone installs (EAS): [docs/PHONE.md](docs/PHONE.md)
- Product spec: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Design system: [docs/DESIGN.md](docs/DESIGN.md)
- Scraper options: [docs/SCRAPING.md](docs/SCRAPING.md)

## Setup

Containers run in Colima, never Docker Desktop. Install once with
`brew install colima docker`, then `colima start --cpu 4 --memory 8 --disk 30`.
The `docker` formula is the command-line client Colima speaks; it is not the
Desktop app. The Supabase CLI talks to that client. Do not install Docker
Desktop, and do not run `docker` commands by hand.

1. `npm install`
2. `npm run db:start` — starts the local Supabase stack.
3. `npm run env -- local` — points the app, the scripts, and the operator UI at that stack.
4. `npm run db:reset` — applies migrations and seeds a snapshot of real
   inventory, so the deck has watches in it once you sign in.
5. `npm run web` (browser) or `npm run ios` (simulator via Expo Go)

To look at the UI with no backend at all, use `npm run demo:web` or `npm run demo`.

Native modules such as Sign in with Apple do not load in Expo Go. For those, install
a development build (below) and run `npm run start:dev`.

## Choosing a backend

`.env` holds the hosted backend. One command moves the app, the operator
scripts, and the operator UI together:

```
npm run env              # where each points right now
npm run env -- local     # the running local stack
npm run env -- hosted    # production
```

`local` writes `.env.local` from `supabase status`, which Expo loads at higher
precedence and git ignores; `hosted` deletes it. Restart Metro after switching,
because env is read when it starts.

Do not edit `.env.local` by hand. The local stack accepts a key from another
project instead of rejecting it, so a URL changed on its own gives an app that
looks healthy and shows nothing. `npm run check:env` catches that pairing and
runs automatically before `start`, `ios`, `android`, and `web`.

## Filling the local database

`npm run db:reset` seeds `supabase/seed.sql`, a snapshot of real inventory —
real references, real prices, photographs served from the shop's own site. There
are no invented fixtures, because placeholder photos beside real watches ruined
every judgement about how the app looked. Nothing is scraped and no OpenAI call
is made, so a reset is free and works offline.

The seeded shop belongs to a seed account rather than to you, on purpose: the
deck hides listings you imported yourself, so a seed owned by the account you
sign in with would look like a seed that failed.

Regenerate it from a live project when the shape of the data changes:

```
npm run snapshot
```

To add a different shop to the local stack instead:

```
npm run dealers:local -- add goldfingersvintage.com --limit 10 --yes
```

Listings are invisible to anyone not signed in, so an empty deck on the sign-in
screen is expected.

Only email codes are enabled. Apple and Google are written but switched off, because
neither has credentials yet — see "Enabling Apple and Google" below.

## Sign-in during local development

Codes go to the local mail catcher at http://127.0.0.1:54324 rather than a real
inbox. On the simulator or web the app reads that inbox and signs you in. On a
physical phone, type the six digit code from Mailpit on the Mac.

## Enabling Apple and Google

Both are implemented and both are off. Turning either on takes three matching changes,
and skipping one gives you `provider is not enabled` from the auth server.

**Google** — create an OAuth client in Google Cloud, then set
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `..._SECRET`, and
`EXPO_PUBLIC_GOOGLE_SIGN_IN=1`. `[auth.external.google]` is already enabled in
`config.toml`. See `docs/AUTH.md`.

**Apple** — needs the paid Apple Developer Program and a Services ID, plus
`[auth.external.apple] enabled = true`. The door is always on screen. On an
iPhone with a development build it is Apple's own button. In a browser or Expo
Go it is ours, and the tap needs that Services ID before Apple will answer.

If you ship on iOS offering Google, App Store review requires Sign in with Apple too.

## Importing listings

Importing is an operator job, so it runs from the terminal rather than the app:

```
npm run dealers -- add goldfingersvintage.com   # the whole flow, from a domain
npm run dealers                                 # list dealers and their permission
npm run dealers -- approve <id|host>            # publish their listings
npm run dealers -- revoke  <id|host>            # pull them back
npm run dealers -- set     <id|host>            # re-read their name and address
npm run dealers -- stats   <id|host>            # saves and inquiries per watch
npm run dealers -- remove  <id|host>            # delete them, listings and photos
```

`add` finds the dealer's catalog from their sitemap, reads their shop name and contact
address, prints a few watches it extracted, and waits for you before writing anything.
Then it imports and approves in one step. Flags: `--limit 10`, `--url <catalog>`,
`--name "Shop"`, `--email <address>`, `--yes`.

The contact address is what makes an inquiry reach a dealer, so `list` warns about any
dealer missing one.

Use `npm run import -- <url> --limit 10` to re-run a dealer you have already added.
Listings already imported are skipped, so it is safe to repeat.

Imported listings stay invisible to everyone but the importer until the dealer is
approved, and RLS makes self-approval impossible. That is deliberate: it keeps a shop's
inventory from being republished just because someone scraped it.

The importer needs an OpenAI key to turn a scraped page into typed listings:

```
cp supabase/functions/.env.example supabase/functions/.env   # add OPENAI_API_KEY
npm run db:stop && npm run db:start
```

Secrets are read when the function's container is built, so editing the file is not
enough — the container keeps the environment it was created with. Restart the stack
with `npm run db:stop && npm run db:start`, not a container CLI. Scraping falls back to
plain `fetch` with no key, which handles
static HTML only; set `FIRECRAWL_API_KEY` or `JINA_API_KEY` for JavaScript-rendered
shops. See [docs/SCRAPING.md](docs/SCRAPING.md).

`npm run env -- hosted` points the scripts at production. The hosted keys stay
in `scripts/.env.operator.local`, which the switch reads and never rewrites.

## The operator UI

Answering dealer applications and publishing shops runs in a web app, separate
from the phone app and with its own dependencies:

```
npm run env -- local     # writes operator/.env.local from `supabase status`
npm run operator         # http://localhost:5173
```

Sign in with an email and password, both set from the terminal. There is no
sign-up and no reset in the UI, so this is the only way in:

```
npm run dealers -- operator you@example.com --password "..."
```

That creates the account if it does not exist, sets the password if it does, and
grants operator either way. Twelve characters minimum. With no argument it
grants `operator@graham.local`, whose local password is `graham-operator`.

Watch which backend you grant on. A grant only counts in the project it was
made in, and `npm run env` moves the scripts and the UI together so they agree.
`npm run dealers:local` grants on the local stack whichever way the repo is
switched.

An operator is a row in an `operators` table, not whoever holds
`SUPABASE_SERVICE_ROLE_KEY` — that key bypasses row-level security on every
table and never belongs in a browser. So access is revocable per person, and
`npm run db:reset` drops the grant along with everything else.

### Seeding the deck

Filling the app with watches is three steps, deliberately separate, because only
the second costs money and only the third is visible to a buyer.

1. **Add shops.** Paste domains one per line, or upload a CSV with a
   `domain,name,email` header. Each site is read first and shown as a table you
   can cut rows from; then each shop is created unpublished with its catalogue
   read. Costs HTTP on Shopify and Squarespace.

   **Listed** on that table counts product URLs in their sitemap, sold stock and
   all — a vintage dealer's is mostly watches they sold years ago, so 970 listed
   against 79 for sale is normal. **Inspect** on a row reads their whole feed and
   opens every product underneath it: brand, type, price, SKU, photo count,
   publish date, and whether it is for sale, sold, or refused with the reason.
   It writes nothing.
2. **Import** on a shop's row. Turns catalogue items into watches — a model call
   and a photo download each, so you type the count.
3. **Publish** the shop. This is what puts its watches in the deck.

Nothing is lost if you close the tab mid-run. Domains are keyed on the shop's
website, so pasting the same list again skips what is already there, and a shop's
**Catalogue** column reports what is still queued for a stopped import.

The arrow on a shop's row opens what has been imported, with photos, prices and
the catalogue items that failed to read.

Adding or refreshing a shop also reads three things off their homepage for their
page in the app: a description in their own words, an Instagram handle, and the
icon their site declares. Of eight real dealer sites, 7 published a description,
7 a handle and 6 an icon. A phone number and a postal address were on 1 and 0,
so neither is collected.

Importing is refused on a shop a dealer has claimed — they manage their own
inventory from the app. Those rows show Import disabled.

More in [docs/OPERATING.md](docs/OPERATING.md).

## Layout

```
src/app/            routes; (app)/(tabs) holds Buy, Community, Messages, Wishlist, Profile, Search
src/features/       auth, onboarding, listings, dealers, exchange, messages, saved
src/components/     SwipeCard, DeckGrid, ListingRow, shared UI primitives
src/data/           one module per entity, TanStack Query hooks
src/lib/            supabase client, auth, design tokens, generated types
src/providers/      session, query cache, theme
scripts/            operator tools and RLS tests
operator/           operator web app; own package.json, Vite not Expo
supabase/migrations schema and RLS
supabase/functions  import, inquiry, claim, and application edge functions
```

## Development build

`expo-dev-client` is a library inside Graham's own binary. Expo Go is Expo's generic
host. Installing the package is not enough: the Simulator still opens Expo Go until
Graham.app is compiled and installed once.

For the iOS Simulator (no Apple Developer account):

```
eas build:dev -p ios
```

That uses the `development-simulator` profile, installs Graham on the booted
Simulator, and tries to start Metro. If port 8081 is already taken (`npm run demo`
or `npm run ios`), stop that server and run:

```
npm run start:dev
```

Then press `i`. `npm run ios` still forces Expo Go on purpose.

`app.json` sets `ITSAppUsesNonExemptEncryption` to false so EAS does not prompt for
Apple's export-compliance question. Graham only uses HTTPS.

A Simulator build cannot be copied onto a physical iPhone. A device build needs the
paid Apple Developer Program and `eas build --platform ios --profile development`.
Local `npx expo run:ios` also needs a signing certificate in Xcode, because Sign in
with Apple adds an entitlement.

Rebuild only after a native library, `app.json`, or an SDK bump. JS-only work does
not. Store binaries are a different path: [docs/OPERATING.md](docs/OPERATING.md).

## Commands

| Command | Does |
| --- | --- |
| `npm run web` / `ios` / `android` | Start the app in Expo Go (or the browser) |
| `eas build:dev -p ios` | Build/install the iOS Simulator development client |
| `npm run start:dev` | Talk to a development build already on the Simulator or device |
| `npm run demo:web` / `demo` | Run against fixtures, no backend needed |
| `npm run env [-- local\|hosted]` | Show or switch which backend the app, scripts, and operator UI use |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:rls` | Exercise every row-level security policy over HTTP |
| `npm run db:reset` | Re-apply migrations and seed the inventory snapshot |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the live schema |
| `npm run snapshot` | Rewrite `supabase/seed.sql` from a live project's inventory |
| `npm run dealers:local` | Any `dealers` command, against the local stack |
| `npm run dealers -- add <domain>` | Find, preview, import and approve a new dealer |
| `npm run import -- <url>` | Re-import a dealer you already added |
| `npm run refresh` | Sync every approved shop and auto-publish changes (needs `GRAHAM_CRON_SECRET`) |
| `npm run dealers` | List, approve, revoke, remove or measure dealers |
| `npm run dealers -- applications` | Shops asking to be listed; answer with `accept` or `decline` |
| `npm run dealers -- operator <email>` | Let an account use the operator UI |
| `npm run operator` | Start the operator UI on http://localhost:5173 |
| `npm test --prefix operator` | Unit-test the pasted-list parser |
