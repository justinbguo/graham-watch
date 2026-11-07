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
- **Approval in the Drops proof is not this screen.** `seed` inserts Test Bench with `permission` `approved` through the local service role so a buyer can follow it. That is setup, not a pass of the Dealers screen.

## Gotchas

- `npm run operator` and the Expo web server are different apps. Stopping one does not stop the other. `cleanup` does not kill Vite, because the harness did not start it.
- The console on a hosted URL is production. `up` only writes the local URL. If `operator/.env.local` is edited by hand to the hosted project, stop and do not sign in.
- An empty Dealers list for a non-operator looks like a bug. The screen says `Not an operator` and prints the `dealers -- operator` command.
