# Graham

Swipe-based discovery app for vintage watches. Buyers swipe a deck and save what they
like. Dealer inventory is imported by an operator, not by users.

Expo (SDK 57) + React Native + Expo Router, Supabase for auth, Postgres, and the
import edge function.

- Operating guide: [docs/OPERATING.md](docs/OPERATING.md)
- Product spec: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Design system: [docs/DESIGN.md](docs/DESIGN.md)
- Scraper options: [docs/SCRAPING.md](docs/SCRAPING.md)

## Setup

Docker comes from Colima, not Docker Desktop. Install once with
`brew install colima`, then `colima start --cpu 4 --memory 8 --disk 30`.

1. `npm install`
2. `npm run db:start` — starts the local Supabase stack, prints the API URL and anon key.
3. `cp .env.example .env` and paste those two values in.
4. `npm run db:reset` — applies migrations. It seeds nothing; see "Filling the
   local database" below.
5. `npm run web` (browser) or `npm run ios` (simulator)

To look at the UI with no backend at all, use `npm run demo:web` or `npm run demo`.

## Choosing a backend

`.env` holds one backend. To point at the local stack, put **both** lines in
`.env.local`, which Expo loads at higher precedence and git ignores:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the publishable key from `supabase status -o env`>
```

Delete the file to go back to the backend in `.env`.

Keep the URL and the key together. Editing the URL alone is the trap: the local
stack accepts a key from another project instead of rejecting it, so the app
looks healthy and shows nothing. `npm run check:env` catches that pairing and
runs automatically before `start`, `ios`, `android`, and `web`.

## Filling the local database

`supabase/seed.sql` is deliberately empty — invented references and placeholder
photos beside real watches ruined every judgement about how the app looked. Put
real inventory in instead:

```
npm run dealers -- add goldfingersvintage.com --limit 10 --yes
```

Run it with no operator env file and it targets whatever `supabase start` is
running. Listings are invisible to anyone not signed in, so an empty deck on the
sign-in screen is expected.

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
`[auth.external.google] enabled = true` in `supabase/config.toml`, export
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `..._SECRET`, and flip
`GOOGLE_SIGN_IN_ENABLED` in `src/lib/auth.ts`.

**Apple** — needs the paid Apple Developer Program and a Services ID, plus
`[auth.external.apple] enabled = true`. It cannot run in Expo Go at all; the button
hides itself there because the native view is missing, so testing it needs a
development build.

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
enough and `docker restart` will not do it either — the container keeps the environment
it was created with. Restart the stack. Scraping falls back to plain `fetch` with no key, which handles
static HTML only; set `FIRECRAWL_API_KEY` or `JINA_API_KEY` for JavaScript-rendered
shops. See [docs/SCRAPING.md](docs/SCRAPING.md).

Point the scripts at a hosted project by setting `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## The operator UI

Answering dealer applications and publishing shops runs in a web app, separate
from the phone app and with its own dependencies:

```
cp operator/.env.example operator/.env.local   # both values from `supabase status`
npm run operator                               # http://localhost:5173
```

Sign in with an email code, the same as the app. Grant the address first — the
UI has signups off, so it cannot let anyone in who has not been granted:

```
npm run dealers -- operator you@example.com
```

That creates the account if it does not exist. With no argument it grants
`operator@graham.local`, the account the other scripts already use. Either way
the code lands in Mailpit, not a real inbox.

Watch which backend you grant on. `npm run dealers` reads
`scripts/.env.operator.local` and points at hosted, while a copied
`operator/.env.example` points the UI at local — and a grant only counts in the
project it was made in. `npm run dealers:local` grants on the local stack.

An operator is a row in an `operators` table, not whoever holds
`SUPABASE_SERVICE_ROLE_KEY` — that key bypasses row-level security on every
table and never belongs in a browser. So access is revocable per person, and
`npm run db:reset` drops the grant along with everything else.

`add <domain>` stays in the terminal. Discovery fetches the dealer's own site and
a browser cannot: their server sends no CORS headers, so the request never
starts.

More in [docs/OPERATING.md](docs/OPERATING.md).

## Layout

```
src/app/            routes; (app)/(tabs) holds Buy, Search, Saved, Profile
src/components/     SwipeCard, DeckGrid, ListingRow, shared UI primitives
src/data/           one module per entity, TanStack Query hooks
src/lib/            supabase client, auth, design tokens, generated types
src/providers/      session, query cache, theme
scripts/            operator tools and RLS tests
operator/           operator web app; own package.json, Vite not Expo
supabase/migrations schema and RLS
supabase/functions  import-listings edge function
```

## Commands

| Command | Does |
| --- | --- |
| `npm run web` / `ios` / `android` | Start the app in Expo Go (or the browser) |
| `npm run start:dev` | Talk to a development build instead of Expo Go |
| `npm run demo:web` / `demo` | Run against fixtures, no backend needed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:rls` | Exercise every row-level security policy over HTTP |
| `npm run db:reset` | Re-apply migrations and seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the live schema |
| `npm run dealers -- add <domain>` | Find, preview, import and approve a new dealer |
| `npm run import -- <url>` | Re-import a dealer you already added |
| `npm run dealers` | List, approve, revoke, remove or measure dealers |
| `npm run dealers -- applications` | Shops asking to be listed; answer with `accept` or `decline` |
| `npm run dealers -- operator <email>` | Let an account use the operator UI |
| `npm run operator` | Start the operator UI on http://localhost:5173 |
