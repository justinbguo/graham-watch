# Operator console

Operators approve shops, read the Users counts, open one account on Accounts, and run imports from a separate web app in `operator/`. It uses the same Supabase project as the Expo app. A signed-in person who is not an operator sees `Not an operator`.

## Sub-features

- `sign-in`: the console's own email sign-in.
- `dealers`: the first screen. Shops are approved here.
- `users`: heading `Users`. Signup counts and onboarding answers. It does not open one account.
- `accounts`: heading `Accounts`. Sort with `Number` or `Last active`. A row shows the collector number, the name, and the email. The empty pane says `Pick an account to read its timeline.` The open pane title starts with `Collector #`. The event list heading is `Timeline`. The header says `times in Pacific`. No events yet says `Nothing logged yet.`
- `guests`: heading `Guests`. One row per signed-out device. `Show operators` is off until pressed. An unclaimed row has `This is me`. A claimed badge opens Accounts.
- `inbox`, `activity`, `applications`, `add`: the other screens in the header.

## How to get to it (user POV)

From the repo root, `npm run operator` starts Vite, usually at `http://127.0.0.1:5173`, after `npm run env -- local` has written `operator/.env.local`. Sign in with an operator account. The nav reads Dealers, Inbox, Users, Accounts, Guests, Activity, Applications, and Add shops. Accounts replaced the per-person drill-in that used to live on Users.

## Driving it with control-graham

Preconditions:

- `up` has pointed the operator UI at the local stack by running `node scripts/env.mjs local`.
- The account is in the `operators` table. `seed` does not grant that. `npm run dealers -- operator <email>` does, and it must be the local stack.

- **The harness does not start Vite or sign into the console.** There is no `operator` subcommand. Do not report the console verified because `doctor` can read dealers.
- **Accounts has no harness command.** The screen reads `operator_accounts` and `operator_account`. `verify-operator` never opens it. A deck screenshot is not a pass of the timeline.
- **Headless approve is `verify-operator`.** It needs `up` and `seed`. The command imports a fixture shop with `GRAHAM_OPERATOR_SECRET`, checks that the anon key, a wrong key, and the buyer token get 401, approves the shop, and screenshots Buy once `Bot Proof Secret Door` is on the deck. It writes `operator-deck.png`, `operator-deck.webm`, and `operator-report.json`. That is not a pass of the console's Dealers screen.
- **`verify-operator-catalog` is the hosted import shape.** The body has no `listings` array. A local Shopify stand-in answers `products.json`, and a local chat stand-in answers the extractor. The stand-in is one page, so the first call finishes the read (`catalogue` `read`) and later calls, while that read is under six hours old, publish two watches and return `publish.pending`. The command repeats until that count is 0 and `catalogue` is `reused`. A shop with another page left returns `catalogue` `partial` and publishes nothing on that call. This stand-in is one page and one wristwatch, so the run finishes on `reused` and does not store a held item. The command writes `catalog-deck.png`, `catalog-deck.webm`, and `catalog-report.json`. Hosted import calls the shop and OpenAI, not those stand-ins.
- **`verify-publish-resume` resumes a killed publish.** It needs `up`. It queues 240 watches plus one listing marked applied with no photographs, then calls operator-bot import until the queue is empty. Each call publishes at most two watches. A shop with fewer than three photographs stays off the deck. It writes `publish-resume.json`. It does not open the console.
- **Chunked catalogue writes.** After a finished read, `import-listings` unpublishes held `source_items` and clears stale rows in updates of at most 100 ids. It calls `sync_source_availability` with at most 2000 seen ids. A larger set passes `p_read_complete` false on each slice, then one call with only the first id and `p_read_complete` true. Rows that share the read's `last_seen_at` stamp retire by age, not by sending the whole id list. `verify-operator-catalog` is one page. `verify-publish-resume` queues 240 watches. Neither reaches those caps. `npm run test:refresh-chunk` needs the local database container, rolls back, and fails unless the unchunked shop-wide update is canceled. The slice proof is `deno test supabase/functions/import-listings/slice.test.ts`. Do not run either against a hosted database.
- **Approval in the Drops proof is not this screen.** `seed` inserts Test Bench with `permission` `approved` through the local service role so a buyer can follow it. That is setup, not a pass of the Dealers screen.

## Gotchas

- `npm run operator` and the Expo web server are different apps. Stopping one does not stop the other. `cleanup` does not kill Vite, because the harness did not start it.
- The console on a hosted URL is production. `up` only writes the local URL. If `operator/.env.local` is edited by hand to the hosted project, stop and do not sign in.
- An empty Dealers list for a non-operator looks like a bug. The screen says `Not an operator` and prints the `dealers -- operator` command.
- A strap, accessory, clock, pocket watch, money-clip watch, empty case, or movement-only part is stored on `source_items` with `hold_reason` and is not published. A title marked `(Objet)` is an accessory unless the title also says watch. Pendant, lapel, brooch, and handheld stopwatch rules exist in the classifier and are switched off. `verify-operator-catalog` does not feed one of these. The proof of the classifier is `supabase/functions/import-listings/nonwatch.test.ts`.
- A WooCommerce shop is read by `woocommerce.ts` from `GET /wp-json/wc/store/v1/products`, with `stock_status=instock` when the host accepts it. The request sets `orderby=id` and `order=asc` when robots.txt allows that URL. When robots.txt disallows it, the reader drops `orderby` and `order` and requests the same path without them. A catalogue URL under `/product-category/<slug>/` sends that category id. `verify-operator-catalog` answers Shopify `products.json` instead, so a green catalog run does not prove WooCommerce, Squarespace, Wix, or Wind Vintage. The Woo proof is `supabase/functions/import-listings/woocommerce.test.ts`. Out of stock, not purchasable, a category slug `sold`, or a title that starts with `sold` is stored unavailable. A book title and a display-sign title are skipped in that file, so `hold_reason` stays unset.
- Squarespace is the collection page HTML (`data-context`, or the older product-list markup), not `?format=json`. A one-photo grid is filled from the product page at publish. Wind Vintage (`windvintage.com`) is read from the homepage image grid, after the Watches heading and before the newsletter block. That read does not open the sitemap. The description starts after the product `h1` or `h2` heading and stops before `PRICE:`, so the page header is not part of the watch. Each page's `PRICE:` line and the last Squarespace button are the price and the stock. `SALE PENDING` and `SOLD` are not for sale. A page with no price and no status button is skipped. An empty grid, or a page that does not answer, leaves the read unfinished so the nightly sweep does not mark the shop sold. Wix is `/store-products-sitemap.xml` plus JSON-LD on each product page. A crawl-delay over 5 seconds is refused. A shorter one is waited inside the run. None of those paths are the Shopify stand-in. The Wind Vintage proof is `supabase/functions/import-listings/squarespace.test.ts`.
