# Graham verification map

This directory is the maintained source for verifying Graham's user-facing behavior. Read this index, then the feature file, before driving the app.

## Baseline preconditions

- One local stack only, started with `node .cursor/skills/verify-graham/control-graham.mjs up`. API `http://127.0.0.1:54321`. Do not start a second stack.
- App web export at `http://127.0.0.1:8091`, started with the `web` command. Do not also run `npm run web` on 8081 for the same proof.
- `node .cursor/skills/verify-graham/control-graham.mjs doctor` reports `stack.apiOk: true` and a local URL.
- The app opens dark. A stored `graham.theme` of light, dark, or system still wins.
- A buyer does not see a Rolex, or a watch whose stored year is after 1985. A null year stays, 1985 stays, and Tudor stays. The shop's owner, the importer, and an operator still see that row. Demo mode does not apply this rule.
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

- [Onboarding](./onboarding.md) — desktop asks a name, then what to show first. Phone still asks name, username, and birthday.
- [Browse and swipe](./browse-swipe.md) — the Buy deck, pass, and save. Rank is `rank_buy_feed`, then shops take turns.
- [New](./new.md). The latest sealed catalogue batch, seated the same way with no personal score. Opening the tab clears the count on this device until a later seal. Not the Drops feed.
- [Dealer shops](./dealer-shops.md) — a shop's page and its watches.
- [Follow and Drops](./drops.md) — follow a shop, get one push for a watch listed after that, see the unseen count on Messages. This is the proven flow.
- [Inquiries](./inquiries.md) — ask a dealer about a watch.
- [Profile](./profile.md) — the signed-in profile and the shops they follow.
- [Dealer shop management](./dealer-shop.md) — a claimed shop edited by the dealer.
- [Operator console](./operator.md). Approve shops, and open Accounts for one person's timeline. Users stays the counts screen. WooCommerce reads the Store API, including one category URL. Squarespace reads the page HTML, and Wind Vintage from the homepage image grid. Wix reads the sitemap plus JSON-LD. The catalog proof is still the Shopify stand-in.
- [Guests](./guests.md). Signed-out browsing on the operator Guests tab. Country and device type only. Unclaimed rows last 180 days.
