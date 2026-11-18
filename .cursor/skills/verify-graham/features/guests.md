# Guests

A signed-out visitor can browse. Graham records that browsing: which watches they opened, how long they looked, and what they tapped, plus the country and the kind of device. Saving a watch still waits until they sign in. The same browser keeps the same guest id across visits, including after sign-in and sign-out.

## Sub-features

- `sign-in copy`: under the tagline, one caption: `Signed-out browsing is recorded, with country and device type only.`
- `guest log`: impressions, dwells, passes, undos, dealer clicks, inquiry opens, and filters. A save, unsave, follow, or unfollow stays on the device until sign-in.
- `guests screen`: heading `Guests` in the operator console. One row per device, last seen first. `Show operators` is off until pressed. An operator row reads `Operator`, then the claimed first name in parentheses when there is one.
- `this is me`: the button on an unclaimed row. It claims that device for the signed-in operator and does not take a claim that already belongs to someone else.
- `claimed badge`: opens Accounts on that person.

## How to get to it (user POV)

The caption is on the sign-in sheet, under the tagline. The Guests screen is the operator console, not a buyer tab. From the repo root, `npm run operator` starts Vite, usually at `http://127.0.0.1:5173`, after `npm run env -- local` has written `operator/.env.local`. Sign in with an operator account. The nav includes Guests, next to Accounts. The empty list says `No guests yet.` The empty detail says `Pick a guest to read what they viewed.`

## Driving it with control-graham

Preconditions:

- `up` has pointed the operator UI at the local stack by running `node scripts/env.mjs local`.
- The account is in the `operators` table. `seed` does not grant that. `npm run dealers -- operator <email>` does, and it must be the local stack.

- **The harness does not open the operator console or the Guests screen.** There is no `guests` subcommand. Do not report Guests verified because a deck screenshot shows a signed-out visitor.
- **The sign-in caption is on the buyer app.** `sign-in` in the harness opens that sheet. The caption is the sentence above. A screenshot of the sheet is the proof of the copy, not of the log.
- **Rows are written by `log_guest_events`.** The proof that a guest pass does not change `buyer_taste` or `rank_buy_feed` is `npm run test:rls` on the local stack. The harness does not call that function.

## Gotchas

- A save tap while signed out is not in the guest log. It stays on the device and is sent with `log_buyer_events` after sign-in.
- The guest id is `graham.guest.key` in device storage. Signing in, signing out, or clearing the event buffer does not mint a new one.
- Unclaimed rows older than 180 days are deleted on the nightly full refresh, before the catalogue seal. A one-shop refresh does not delete them.
- Country comes from the `cf-ipcountry` header when it is two letters. `XX` and `T1` are stored as nothing. The log does not keep an IP, a user agent, a city, or a referrer. A local call often has no country, and that is still a pass.
- Operator devices are hidden until `Show operators`. The label uses the claimed first name. It is not a hardcoded name.
