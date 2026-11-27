# Graham verification map

This directory is the maintained source for verifying Graham's user-facing behavior. Read this index, then the feature file, before driving the app.

## Baseline preconditions

- One local stack only, started with `node .cursor/skills/verify-graham/control-graham.mjs up`. API `http://127.0.0.1:54321`. Do not start a second stack.
- App web export at `http://127.0.0.1:8091`, started with the `web` command. Do not also run `npm run web` on 8081 for the same proof.
- `node .cursor/skills/verify-graham/control-graham.mjs doctor` reports `stack.apiOk: true` and a local URL.
- The app opens dark. A stored `graham.theme` of light, dark, or system still wins.
- A buyer does not see a Rolex, or a watch whose stored year is after 1985. A null year stays, 1985 stays, and Tudor stays. The shop's owner, the importer, and an operator still see that row. Demo mode does not apply this rule.
- A shop that is paused, pending, or revoked has no watches a guest or a signed-in buyer can read. Publishing the shop shows them again. The operator console still lists them. The shop's owner still reads that shop's rows.
- `seed` has created `buyer`, `quiet`, and `dealer` (Test Bench). The hosted project is out of bounds.
- Never drive a stack this run did not start.

## Driving conventions

- Start from the baseline unless the feature file says otherwise.
- Prefer accessible names over coordinates. The names that matter are in each feature file.
- Treat every command as literal, including the quotes.
- Data setup goes through `control-graham`. The browser path goes through `screenshot` or the selectors it uses.
- `cleanup` may run after the proof. It must leave the evidence directory in place.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screen.
- UI proof is a screenshot plus the accessible name of the control that shows the outcome.
- Service proof is the command's JSON: status, row counts, and the captured push body.
- A path that cannot be reached is reported with the command that was run and the missing precondition. Do not mark it verified through a different feature.

## Feature entry contract

Each feature file starts with an H1 and one paragraph a buyer or dealer would recognize. Then exactly four H2 sections, in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-graham`, `Gotchas`.

## Features

`$CG` is `node .cursor/skills/control-graham/bin/control-graham.mjs`. `$VG` is `node .cursor/skills/verify-graham/control-graham.mjs`. This list is the index. Local recipes are in this directory. Demo recipes are in `control-graham/features`.

- Buy deck. `/`. Demo. `$CG press ArrowLeft`. Demo recipe: [deck-swipe.md](../../control-graham/features/deck-swipe.md). Local recipe: [browse-swipe.md](./browse-swipe.md).
- Grid. Buy at 1280. Demo. `$CG snapshot`. Recipe: [deck-swipe.md](../../control-graham/features/deck-swipe.md).
- Filters. `Filters`, and `/filters/deck`. Demo for the sheet. `npm run test:filters` for `listing_matches`. The sheet names are in [deck-swipe.md](../../control-graham/features/deck-swipe.md).
- Search. `/search`. Demo. `$CG fill --name "Search brand, model or reference"`. Recipe: [search.md](../../control-graham/features/search.md).
- Listing. `/listing/[listingId]`. Demo. Recipe: [listing-detail.md](../../control-graham/features/listing-detail.md).
- Wishlist. `/saved`. Demo. Recipe: [wishlist.md](../../control-graham/features/wishlist.md).
- New. `/new`. Local. `$VG verify-new-badge`. Demo badge is a different batch. Local recipe: [new.md](./new.md). Demo recipe: [new.md](../../control-graham/features/new.md).
- Guest sheet. Local, before sign-in. Demo does not show it. Recipe: [guest-signin.md](../../control-graham/features/guest-signin.md).
- Feedback. Buy and New. Demo. Do not send the message. Recipe: [feedback.md](../../control-graham/features/feedback.md).
- Onboarding. Desktop sheet on Buy. Phone `/onboarding`. Local, new mailbox. `seed` accounts skip it. Recipe: [onboarding.md](./onboarding.md).
- Profile. `/profile`. Local. Recipe: [profile.md](./profile.md).
- Settings. `/settings`. Local.
- Shop page. `/dealer/[dealerId]`. Local. Recipe: [dealer-shops.md](./dealer-shops.md).
- Shop editor. Profile and the Deal tab. Local. Recipe: [dealer-shop.md](./dealer-shop.md).
- Follow and Drops. `/dealer/[dealerId]`, `/drops`. Local. `npm run verify:drops`. Recipe: [drops.md](./drops.md).
- Ranking. `rank_buy_feed` then `shop_mix`. Local. `$VG verify-rank` and `npm run test:rank`.
- Shop mix report. `npm run report:shop-mix`. Reads only.
- Operator. `npm run operator`. Local. `$VG verify-operator` hits `operator-bot` and does not open the Vite screen. Recipe: [operator.md](./operator.md).
- Guests. Operator console. Local. The harness does not open the screen. Recipe: [guests.md](./guests.md).
- Fixture import. `$VG import`. Local only. Hosted refuses `action: "fixture"`.
- Import screen. `/import-inventory`. No command opens it.
- Nightly refresh. `npm run refresh` against the local stack. One shop skips purge and seal. A finished catalogue read writes held and stale `source_items` 100 ids at a time and calls `sync_source_availability` with at most 2000 seen ids. Past that, each slice passes `p_read_complete` false and one last call passes the first id with `p_read_complete` true, so missing watches retire by the shared `last_seen_at` stamp. `npm run test:refresh-chunk` proves the unchunked update is canceled. It needs the local database container and rolls back. The fixture `import` is one watch and does not exercise this.
- Catalogue audit. `npm run catalogue:audit`. Writes nothing.
- Claim. `/apply` and `claim-dealer`. No command sends the code.
- Community and Messages. `/community`, `/messages`. Local. Pause banner is expected.
- Enquiry. `/inquiry/[listingId]`. The send button can mail. No `inquire` command. Recipe: [inquiries.md](./inquiries.md).
- Sourcing. `/sourcing/new`. In memory. The tab is `href: null`.

Demo includes a Rolex and a 1988 Cartier. Local applies `listing_for_buyer`. A paused shop disappears for a guest and a signed-in buyer. The owner and an operator still read it.
