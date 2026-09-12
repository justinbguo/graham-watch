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
4. `npm run db:reset` — applies migrations and seeds demo watches.
5. `npm run web` (browser) or `npm run ios` (simulator)

To look at the UI with no backend at all, use `npm run demo:web` or `npm run demo`.

Apple and Google sign-in need a development build, not Expo Go, because both rely on
native modules and the `graham://` URL scheme. Email codes work anywhere.

## Sign-in during local development

Email codes go to the local mail catcher at http://127.0.0.1:54324 rather than a real
inbox. Enter any email, then read the 6-digit code there.

Google needs OAuth credentials in `supabase/config.toml` under `[auth.external.google]`.
Apple needs a paid Apple Developer account and a Services ID.

## Importing listings

Importing is an operator job, so it runs from the terminal rather than the app:

```
npm run import -- https://dealer.example.com/watches
npm run dealers                      # list dealers and their permission
npm run dealers -- approve <id|host> # publish their listings to the deck
```

Imported listings stay invisible to everyone but the importer until the dealer is
approved, and RLS makes self-approval impossible. That is deliberate: it keeps a shop's
inventory from being republished just because someone scraped it.

The importer needs secrets:

```
supabase secrets set SCRAPE_PROVIDER=jina OPENAI_API_KEY=sk-...
```

With no secrets set it falls back to plain `fetch`, which works on static pages only.

Point the scripts at a hosted project by setting `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## Layout

```
src/app/            routes; (app)/(tabs) holds Deck, Saved, Profile
src/components/     SwipeCard, DeckGrid, ListingRow, shared UI primitives
src/data/           one module per entity, TanStack Query hooks
src/lib/            supabase client, auth, design tokens, generated types
src/providers/      session, query cache, theme
scripts/            operator tools and RLS tests
supabase/migrations schema and RLS
supabase/functions  import-listings edge function
```

## Commands

| Command | Does |
| --- | --- |
| `npm run web` / `ios` / `android` | Start the app |
| `npm run demo:web` / `demo` | Run against fixtures, no backend needed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:rls` | Exercise every row-level security policy over HTTP |
| `npm run db:reset` | Re-apply migrations and seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the live schema |
| `npm run import -- <url>` | Import a dealer's listings |
| `npm run dealers` | List, approve, or revoke dealers |
