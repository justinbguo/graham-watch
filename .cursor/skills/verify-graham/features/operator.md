# Operator console

Operators approve shops, read users, and run imports from a separate web app in `operator/`. It uses the same Supabase project as the Expo app. A signed-in person who is not an operator sees `Not an operator`.

## Sub-features

- `sign-in`: the console's own email sign-in.
- `dealers`: the first screen. Shops are approved here.
- `users`, `inbox`, `activity`, `applications`, `add`: the other screens in the header.

## How to get to it (user POV)

From the repo root, `npm run operator` starts Vite, usually at `http://127.0.0.1:5173`, after `npm run env -- local` has written `operator/.env.local`. Sign in with an operator account. The nav reads Dealers, Inbox, Users, Activity, Applications, and Add shops.

## Driving it with control-graham

Preconditions:

- `up` has pointed the operator UI at the local stack by running `node scripts/env.mjs local`.
- The account is in the `operators` table. `seed` does not grant that. `npm run dealers -- operator <email>` does, and it must be the local stack.

- **The harness does not start Vite or sign into the console.** There is no `operator` subcommand. Do not report the console verified because `doctor` can read dealers.
- **Headless approve is `verify-operator`.** It needs `up` and `seed`. The command imports a fixture shop with `GRAHAM_OPERATOR_SECRET`, checks that the anon key, a wrong key, and the buyer token get 401, approves the shop, and screenshots Buy once `Bot Proof Secret Door` is on the deck. It writes `operator-deck.png`, `operator-deck.webm`, and `operator-report.json`. That is not a pass of the console's Dealers screen.
- **`verify-operator-catalog` is the hosted import shape.** The body has no `listings` array. A local Shopify stand-in answers `products.json`, and a local chat stand-in answers the extractor. The stand-in is one page, so the first call finishes the read (`catalogue` `read`) and later calls, while that read is under six hours old, publish two watches and return `publish.pending`. The command repeats until that count is 0 and `catalogue` is `reused`. A shop with another page left returns `catalogue` `partial` and publishes nothing on that call. A strap, accessory, clock, or other non-wristwatch is stored with `hold_reason` and is not published. The screenshot is `catalog-deck.png`. Hosted import calls the shop and OpenAI, not those stand-ins.
- **`verify-publish-resume` resumes a killed publish.** It needs `up`. It queues 240 watches plus one listing marked applied with no photographs, then calls operator-bot import until the queue is empty. Each call publishes at most two watches. A shop with fewer than three photographs stays off the deck. It writes `publish-resume.json`. It does not open the console.
- **Approval in the Drops proof is not this screen.** `seed` inserts Test Bench with `permission` `approved` through the local service role so a buyer can follow it. That is setup, not a pass of the Dealers screen.

## Gotchas

- `npm run operator` and the Expo web server are different apps. Stopping one does not stop the other. `cleanup` does not kill Vite, because the harness did not start it.
- The console on a hosted URL is production. `up` only writes the local URL. If `operator/.env.local` is edited by hand to the hosted project, stop and do not sign in.
- An empty Dealers list for a non-operator looks like a bug. The screen says `Not an operator` and prints the `dealers -- operator` command.
