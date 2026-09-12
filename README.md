# Graham

Swipe-based discovery app for vintage watches. Buyers swipe a deck and save what they
like. Sellers paste a URL and an AI importer recreates those listings in the app.

Expo (SDK 57) + React Native + Expo Router, Supabase for auth, Postgres, and the
import edge function.

- Product spec: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Scraper options: [docs/SCRAPING.md](docs/SCRAPING.md)

## Setup

1. `npm install`
2. `npm run db:start` — starts the local Supabase stack, prints the API URL and anon key.
3. `cp .env.example .env` and paste those two values in.
4. `npm run db:reset` — applies migrations and seeds six demo watches.
5. `npm run ios`

Apple and Google sign-in need a development build, not Expo Go, because both rely on
native modules and the `graham://` URL scheme. Email codes work anywhere.

## Sign-in during local development

Email codes go to the local mail catcher at http://127.0.0.1:54324 rather than a real
inbox. Enter any email, then read the 6-digit code there.

Google needs OAuth credentials in `supabase/config.toml` under `[auth.external.google]`.
Apple needs a paid Apple Developer account and a Services ID.

## Import

The Import tab posts to the `import-listings` edge function, which creates a row in
`import_jobs`, scrapes in the background, and streams status back over Realtime.

Run it locally with `npm run functions:serve`. It needs secrets:

```
supabase secrets set SCRAPE_PROVIDER=jina OPENAI_API_KEY=sk-...
```

With no secrets set it falls back to plain `fetch`, which works on static pages only.

## Layout

```
src/app/            routes; (app)/(tabs) holds Deck, Saved, Import, Profile
src/components/     SwipeCard, ListingRow, and shared UI primitives
src/lib/            supabase client, auth, queries, generated types
supabase/migrations schema and RLS
supabase/functions  import-listings edge function
```

## Commands

| Command | Does |
| --- | --- |
| `npm run ios` / `android` | Start the app |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Re-apply migrations and seed |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the live schema |
| `npm run functions:serve` | Run the import function locally |
