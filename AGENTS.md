# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# App map

Graham is a vintage-watch aggregator. Buyers browse watches that dealers already list on their own sites, and the watch opens on the dealer's page. Dealers claim a shop. Operators approve which shops reach the deck. The phone and web app is Expo SDK 57 (Router, React Native). Data is Supabase (Auth, Postgres, edge functions). Vercel builds the Expo web export from `main` (`vercel.json`). The operator console is a separate Vite app in `operator/`, with its own `operator/vercel.json`.

Longer guides stay where they are. Update this file when a route, table, function, or workflow changes, and delete the sentence that change makes false.

| Question | Read |
| --- | --- |
| How to run, reset, and operate | [docs/OPERATING.md](docs/OPERATING.md) |
| How to ship a change | [docs/DEVELOPING.md](docs/DEVELOPING.md) |
| What the product is supposed to do | [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) |
| Visual rules | [docs/DESIGN.md](docs/DESIGN.md) and `src/lib/design.ts` |
| Auth | [docs/AUTH.md](docs/AUTH.md) |
| Scraping a shop site | [docs/SCRAPING.md](docs/SCRAPING.md) |
| Deals and fees | [docs/TRANSACTIONS.md](docs/TRANSACTIONS.md) and [docs/MARKETPLACE.md](docs/MARKETPLACE.md) |
| Graham Pro | [docs/REVENUECAT.md](docs/REVENUECAT.md) |
| Phone builds | [docs/PHONE.md](docs/PHONE.md) |
| Which shops the scraper can read | [docs/dealer-site-readiness.md](docs/dealer-site-readiness.md) |
| Cursor rules | `.cursor/rules/` (judgment, architecture, data, design, Supabase, teaching) |

`studio/` is a Next.js Higgsfield template (`npm run studio`). It is not the operator console and not the Expo app.

## Routes

Expo Router lives in `src/app`. Tabs are in `src/app/(app)/(tabs)/_layout.tsx`.

Buyer tabs, left to right on a phone:

- **Buy** (`index`). Deck, ordered by a personal score (`src/data/rank.ts`, `rank_buy_feed`), then seated by `shop_mix`: each shop's best watch, then each shop's next, and inside a shop the brands take turns. A click outweighs a save, a pass is a mild negative, an undo does not count, and a followed shop is boosted. Wide web shows a grid. A signed-out visitor gets the sign-in sheet first. After sign-in, desktop web asks for a name on one line, then "What should we show you first?" on the filter panel without dealers (`src/features/deck/FirstRunSheet.tsx`). Phone still walks the question flow.
- **New** (`new`). The latest sealed catalogue batch, drawn with the same deck as Buy (`src/features/deck/CatalogueDeck.tsx`, data in `src/data/newListings.ts`). `latest_catalogue_batch` runs the same shop seating on newest-first, with no personal score. The red count is the size of that batch until this device opens New. Opening the tab stores the batch id on the device (`graham.seen-new-batch`) and the count stays clear after a reload. A later seal has a new batch id, so the count comes back. Guests and signed-in people share that device mark. Guests see the tab too.
- **Community** (`community`). Posts to sell, buy, or trade. Tables still say `exchange_*`.
- **Messages** (`messages`). Threads, plus the Drops row when a followed shop has unseen new watches. Signed-out visitors get the guest gate.
- **Wishlist** (`saved`).
- **Profile** (`profile`). Following lives here. Drops does not. A person with no photo gets the bundled portrait in `assets/paul-graham.jpg`. The "Do you run a shop listed here?" card is not shown. A shop whose published address matches the signed-in email still offers Claim this shop. Settings edits the display name (`profiles.first_name`, `profiles.last_name`) and hides Payment & shipping and Backend. The app opens dark. A stored `graham.theme` of light, dark, or system still wins.

A claimed dealer sees **Deal** in place of Messages (`SellerHubScreen`). Sections are Messages, Payments, Analytics, Listings, and Support. Payments is a placeholder. Support opens `mailto:hello@graham.watch`.

`source` is registered with `href: null`, so it is absent from the bar. Sourcing posts are in-memory in `src/data/sourcing.ts`.

Stack routes under `src/app/(app)/`:

- `sign-in`, `onboarding` (root `src/app/onboarding.tsx`)
- `listing/[listingId]`, `photos/[listingId]`, `edit-listing/[listingId]`, `filters/[surface]`, `search`
- `drops` (New watches feed; `?dealerId=` opens one shop)
- `conversation/[conversationId]`, `new-message`, `new-group`, `seller-messages`
- `dealer/[dealerId]`, `collector/[userId]`, `inquiry/[listingId]`
- `apply`, `import-inventory`, `graham-pro`, `settings`
- `sourcing/new`, `sourcing/[requestId]`
- A path that is not a screen shows `+not-found` ("This page is not on Graham.").

Desktop web puts the tab bar on top (`useIsDesktopWeb`). A wide window that is not desktop web uses a left rail.

## Who does what

**Buyer.** Sign in, finish onboarding (name, username, birthday 18+, notification permission), swipe Buy, follow a shop from Community or the shop page, read Drops from Messages, message a claimed shop, email an unclaimed shop. Community and Messages stay in the app under a pause banner. Buying a watch uses the listing's dealer page.

**Dealer.** Profile, claim a shop. The open "Do you run a shop listed here?" card is hidden. Claim this shop still shows when the signed-in email is on the shop's site, and `/apply` still starts a claim. The claim function emails a code to a mailbox on the shop domain. After claim, the Deal tab replaces Messages. Publishing the shop onto the deck is still an operator action (`dealers.permission`).

**Operator.** Not a tab. `npm run dealers` (service role) and `operator/` (anon key plus a row in `operators`). Both approve shops and answer applications. RLS stops a dealer from approving their own shop. The console's Accounts screen (`operator/src/Accounts.tsx`) lists every account with its email and opens one collector's timeline, newest first, in Pacific time. Guests (`operator/src/Guests.tsx`) lists each signed-out device. A claimed badge opens that account.

## Data

Migrations are append-only under `supabase/migrations`. Types come from `npm run db:types` into `src/lib/database.types.ts`. App code imports `Database` from `src/lib/database.ts`. Do not hand-edit the generated file.

Tables:

- People and access: `profiles`, `operators`, `operator_actions`
- Shops: `dealers`, `dealer_applications`, `dealer_claim_codes`, `dealer_follows`, `import_jobs`, `source_items`, `refresh_runs`
- Watches: `listings`, `listing_photos`, `swipes`, `watch_models`, `watch_catalog_sync`
- New tab: `catalogue_batches`, `catalogue_batch_listings`. RLS on, no policies, and every grant revoked, including from `service_role`. `seal_catalogue_batch` writes them and `latest_catalogue_batch` reads them. A watch is in at most one batch.
- Mail: `inquiries`
- Community: `exchange_posts`, `exchange_comments`, `exchange_photos`, `exchange_votes`
- Messages and deals: `conversations`, `conversation_members`, `messages`, `conversation_reads`, `conversation_deals`, `checkout_defaults`, `deal_reviews`
- Drops: `drop_notifications`, `drop_views`, `device_push_tokens`
- Buyer events: `buyer_events`. Append-only. `log_buyer_events` writes a signed-in row. `log_guest_events` writes an unclaimed row (`user_id` null, `guest_key` required). `claim_guest_events` fills `user_id` when that device signs in. Operators read accounts through `operator_accounts` and `operator_account`, and guests through `operator_guests`, `operator_guest`, and `operator_claim_guest`. The service role keeps the only table select. Deleting an account deletes its events; deleting a listing does not. `buyer_taste` still reads `e.user_id = uid` only, so an unclaimed row does not rank anyone's deck. The app sends through `src/data/listingEvents.ts`.
- Guest devices: `guest_devices`. One row per stable guest key (country and device type). RLS on, no policies, and no client grants. The service role can select. `purge_unclaimed_guest_events` deletes unclaimed guest rows older than 180 days.

Row-level security is on for these tables. The anon key ships in the app. Policies are proved by `npm run test:rls`. The three gates (`profiles.account_type`, `dealers.claimed_by`, `dealers.permission`) are explained in [docs/OPERATING.md](docs/OPERATING.md). `dealer_claim_codes` has RLS and no policies, so the app cannot read codes. Counts and dealer lists that must hide columns are SQL functions (`listing_counts`, `operator_dealers`), not extra tables. `listing_for_buyer(listings)` is the one predicate for a buyer. It rejects a Rolex brand and a known year after 1985. A null year stays, and Tudor stays. `listing_on_deck(listings)` is the guest catalogue predicate (active, unsold, three photos, approved shop, and `listing_for_buyer`). The anon listing policy, the seal, and `latest_catalogue_batch` call `listing_on_deck`. `rank_buy_feed` calls `listing_for_buyer` because that function is security definer. A restrictive select policy applies the same predicate to security invoker reads, so search, a shop page, the wishlist, drops, and a direct listing link follow it. The shop owner, the importer, and an operator can still read the row.

## Edge functions

Code is `supabase/functions`. `verify_jwt` stays on for every function except `operator-bot`. A project secret key (`sb_secret_...`) is not a JWT, so the gateway would reject it before that function could check `GRAHAM_OPERATOR_SECRET`. Deploy is the `Deploy edge functions` workflow, not a pull request check. Do not deploy from an agent session unless someone asked.

| Function | Who calls it | What it writes |
| --- | --- | --- |
| `import-listings` | App and operator (`src/data/dealers.ts`, `operator/src/importer.ts`, `scripts/_import.mjs`). Nightly refresh sends `action: "scheduled-refresh"` with the service role and `x-graham-cron-secret`. Local proof sends `action: "fixture"`, which the hosted function refuses. | Listings, photos, `import_jobs`, `source_items`. Adapters are Shopify, Squarespace (HTML `data-context`, or the older product-list markup, not `?format=json`; a one-photo grid is filled from the product page at publish, and a refresh does not store a shorter gallery). Squarespace also reads Wind Vintage from the homepage image grid (not the sitemap, not `?format=json`). Each page's PRICE line and the last Squarespace button are the price and stock. The description is the text after the product heading and before PRICE, so the site header is not part of the watch. SALE PENDING and SOLD are not for sale. A page with no price and no status button is skipped. WooCommerce Store API (in-stock, `orderby=id` when robots.txt allows it, otherwise the same URL without `orderby` or `order`, and a `/product-category/<slug>/` URL reads that category), and Wix Stores (sitemap plus product-page JSON-LD). Caps, shirts, gift cards, and advertisement listings are held. A crawl-delay over 5 seconds is refused. A shorter one is waited inside one run's time budget. A strap, accessory, clock, or other non-wristwatch is stored with `source_items.hold_reason` (`not_a_watch` for a pocket watch, money-clip watch, empty case, or movement-only part) and is not published. A title marked `(Objet)` is an accessory unless the title also says watch. Pendant, lapel, brooch, and handheld stopwatch rules are in the classifier and switched off. The next availability sweep marks a held item's listing sold with `sold_source` `not_a_watch`. A dealer who already marked it sold keeps that mark. `discover` and `preview` write nothing. |
| `notify-drops` | `scripts/refresh.mjs` after a catalogue write. Same service role and cron header. | `drop_notifications`, then an Expo push. Local stacks may set `EXPO_PUSH_URL` only when `SUPABASE_URL` is a local host. |
| `claim-dealer` | `src/data/dealers.ts` | A mailbox code, then the claim. |
| `verify-application` | `src/data/applications.ts` | A code for an application mailbox. |
| `inquiry-draft` | `src/data/inquiries.ts` | Nothing. Returns the email text. The dealer address stays on the server. |
| `send-inquiry` | `src/data/inquiries.ts` | Sends the inquiry mail and updates the inquiry row. |
| `operator-bot` | A bot that holds `GRAHAM_OPERATOR_SECRET` and calls the function over HTTPS. No signed-in session. | Discover, inspect, and import. Inspect and import read one Shopify page per call and store the next page on the running `import_jobs` row, so the same body continues the feed. A finished read is reused for six hours, and each later import publishes one batch of two watches and returns `publish.pending`. While a page remains, `catalogue` is `partial` and `publish.pending` is the real queue, which is still empty. Fixture import on a local stack. Approve and unapprove through `bot_set_dealer_permission`. `enrich-icons` refreshes `dealers.logo_url` and does not import listings. It is a dry run unless `dryRun` is false. Reads one shop's listing counts and latest `import_jobs` row. Audit rows in `operator_actions` with `actor` `operator-bot`. |

`npm run refresh` is the daily Catalogue refresh (06:00 UTC, plus `workflow_dispatch`). It re-reads approved shops. A full run that exits 0 calls `purge_unclaimed_guest_events` (unclaimed guest rows older than 180 days), then `seal_catalogue_batch` with one run id per process, which records the watches on the deck created in the last 7 days and not yet in a batch. Then it calls `notify-drops`. A one-shop run (`npm run refresh -- <dealer-id>`) does not purge and does not seal. A shop that fails for any reason other than a plain gateway 503 fails the job after every approved shop has been attempted. A plain gateway 503 stays a warning. A failed purge, seal, or notify call fails the job. `npm run catalogue:audit` compares each approved shop's public feed with the catalogue and writes nothing. `npm run report:shop-mix` counts shops in the first 20 and first 50 cards of Buy and New. It only reads. The committed seed is one shop, so those two windows stay 1 there.

## CI and deploys

| Workflow | When | Jobs |
| --- | --- | --- |
| `CI` (`.github/workflows/ci.yml`) | Push to `main`, and every pull request | `app` (typecheck, web export, planner tests), `operator ui`, `edge functions` (`deno check` on all seven, then `deno test`), `database` (migrations, `test:rls`, `test:filters`, `test:rank`, generated types), `drops verification` (`npm run verify:drops`) |
| `Catalogue refresh` | Cron `0 6 * * *`, and manual | `npm run refresh` against hosted |
| `Deploy edge functions` | Push to `main` that touches `supabase/functions/**`, `supabase/config.toml`, `scripts/deploy-functions.mjs`, or the workflow file. Manual deploys every function. | Ships every function when any function source, a shared folder, config, the deploy script, or the workflow changes. A test-only change ships nothing. Does not apply migrations. |

Vercel deploys the Expo web app from `main`. Preview builds run on pull requests. See [docs/DEVELOPING.md](docs/DEVELOPING.md).

## Env and secret names

Names only. Values stay in GitHub Actions secrets, Supabase function secrets, or gitignored `.env.local` files.

App (`EXPO_PUBLIC_*`, public in the binary): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_SIGN_IN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_REVENUECAT_API_KEY`, `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY`, `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT`, `EXPO_PUBLIC_DEMO`.

Local auth provider config for `supabase start`: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET`.

Operator UI: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Studio server: `HF_API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Edge functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GRAHAM_CRON_SECRET`, `GRAHAM_OPERATOR_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_CONCURRENCY`, `SCRAPE_PROVIDER`, `JINA_API_KEY`, `FIRECRAWL_API_KEY`, `EXPO_ACCESS_TOKEN`, `EXPO_PUSH_URL`, `APP_ORIGIN`, `SUPPORT_EMAIL`, `INQUIRY_FROM`, `RESEND_API_KEY`, `SMTP_HOST`, `SMTP_PORT`.

`GRAHAM_OPERATOR_SECRET` is the project's secret key (`sb_secret_...`), set with `supabase secrets set`. The bot stores that one value and sends it as the bearer token. The calls are in [docs/OPERATING.md](docs/OPERATING.md).

GitHub Actions secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GRAHAM_CRON_SECRET`.

## Verification

`npm run verify:drops` runs `.cursor/skills/verify-graham/control-graham.mjs`. One local stack, project id `graham-watch`, API `http://127.0.0.1:54321`, web `http://127.0.0.1:8091`. Read `.cursor/skills/verify-graham/SKILL.md` and `features/README.md` before driving a feature. The hosted project is out of bounds for that harness.

`.cursor/skills/control-graham` is the demo Metro path (`EXPO_PUBLIC_DEMO=1`) for deck, search, and wishlist. Supabase proofs stay on `verify-graham`.

## Rules that bite

- `src/app/**` is routes only. Data lives in `src/data/`. Features live in `src/features/`.
- No literal colors, font sizes, or raw gaps in components. Tokens are `src/lib/design.ts`.
- Never edit a migration that has already run. Add a new file.
- `npm run db:push` against hosted is a production schema change. Do not run it from an agent session unless someone asked.
