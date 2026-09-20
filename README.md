# Graham

Swipe-based discovery app for vintage watches. Buyers swipe a deck and save what they
like. Dealer inventory is imported by an operator, not by users.

Expo (SDK 57) + React Native + Expo Router, Supabase for auth, Postgres, and the
import edge function.

- Operating guide: [docs/OPERATING.md](docs/OPERATING.md)
- Phone installs (EAS): [docs/PHONE.md](docs/PHONE.md)
- Product spec: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Auth: [docs/AUTH.md](docs/AUTH.md)
- Design system: [docs/DESIGN.md](docs/DESIGN.md)
- Scraper options: [docs/SCRAPING.md](docs/SCRAPING.md)

## Setup

Docker comes from Colima, not Docker Desktop. Install once with
`brew install colima`, then `colima start --cpu 4 --memory 8 --disk 30`.

1. `npm install`
2. `npm run db:start` — starts the local Supabase stack, prints the API URL and anon key.
3. `cp .env.example .env` and paste those two values in.
4. `npm run db:reset` — applies migrations and seeds demo watches.
5. `npm run web` (browser) or `npm run ios` (simulator)

To look at the UI with no backend at all, use `npm run demo:web` or `npm run demo`.

To install on a real phone without leaving Metro running, use an EAS `preview`
build (demo fixtures baked in). See [docs/PHONE.md](docs/PHONE.md).

Only email codes are enabled. Apple and Google are written but switched off, because
neither has credentials yet — see [docs/AUTH.md](docs/AUTH.md) and the short version
below.

## Sign-in during local development

Email codes go to the local mail catcher at http://127.0.0.1:54324 rather than a real
inbox. Enter any email, then read the 6-digit code there.

## Enabling Apple and Google

Both are implemented and both stay off until credentials exist. Skipping a step gives
you `provider is not enabled` from the auth server.

**Google** — create a Web OAuth client in Google Cloud (see AUTH.md), put
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `..._SECRET` in `.env`, then set
`EXPO_PUBLIC_GOOGLE_SIGN_IN=1`. `[auth.external.google]` is already `enabled = true`
in `config.toml`; the env flag is what shows the button. Restart Supabase and Expo
after editing `.env`.

**Apple** — needs the paid Apple Developer Program and a Services ID, plus
`[auth.external.apple] enabled = true`. It cannot run in Expo Go; the button hides
itself there. Testing needs a development or EAS build.

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
Listings already imported are skipped, so it is safe to repeat. `npm run sweep`
re-checks approved dealers and marks watches sold when the shop feed says so.

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

## Layout

```
src/app/            routes; tabs are Buy, Search, Source, Saved, Profile
src/features/       domain UI (filters, sourcing, dealers)
src/components/     SwipeCard, DeckGrid, ListingRow, shared UI primitives
src/data/           one module per entity, TanStack Query hooks
src/lib/            supabase client, auth, design tokens, generated types
src/providers/      session, query cache, theme
scripts/            operator tools and RLS tests
supabase/migrations schema and RLS
supabase/functions  import-listings, send-inquiry
```

## Commands

| Command | Does |
| --- | --- |
| `npm run web` / `ios` / `android` | Start the app |
| `npm run demo:web` / `demo` | Run against fixtures, no backend needed |
| `npm run build:preview:android` / `build:preview:ios` | EAS cloud build you can install on a phone |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:rls` | Exercise every row-level security policy over HTTP |
| `npm run db:reset` | Re-apply migrations and seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the live schema |
| `npm run dealers -- add <domain>` | Find, preview, import and approve a new dealer |
| `npm run import -- <url>` | Re-import a dealer you already added |
| `npm run sweep` | Re-check approved dealers for sold watches |
| `npm run dealers` | List, approve, revoke, remove or measure dealers |
