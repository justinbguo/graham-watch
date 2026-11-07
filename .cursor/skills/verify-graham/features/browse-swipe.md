# Browse and swipe

Buy is the deck. A buyer passes or saves a watch. On a wide window the same watches are a grid. Guests on the web can browse, and the eleventh judgment asks them to sign in.

## Sub-features

- `deck`: the Buy tab, route `/`.
- `pass`: swipe left, or the control named `Pass`.
- `save`: swipe right. The watch lands on the Wishlist.
- `grid`: at 900px and wider the deck is a grid of tiles.
- `guest-budget`: ten guest judgments, then the sign-in sheet.

## How to get to it (user POV)

Open the app. Web guests land on Buy. The header has `Log in`. iOS shows the sign-in wall first. Search is the field named `Search brand, model or reference`. Filters open from the filter control.

## Driving it with control-graham

Preconditions:

- `up` and `web` are ready. The seeded catalogue from `supabase/seed.sql` is on the deck. Test Bench's shelf listing is there too once `seed` has run.

- **Open Buy.** Run `node .cursor/skills/verify-graham/control-graham.mjs screenshot / <evidence>/buy.png`. The shot is the deck or the guest gate, not a proof of a swipe.
- **Pass and save are not harness commands yet.** A swipe has to happen in the browser. Do not treat a Drops screenshot as proof that pass and save work.

## Gotchas

- `screenshot` signs in when it sees `Log in or create an account`. On `/` that button is not the guest gate. The header button is `Log in`. The current screenshot command does not press it, so `/` stays signed out.
- Demo mode (`EXPO_PUBLIC_DEMO=1`) never hits this stack. Do not export the web build with that variable set.
- A claimed shop is hidden from the dealer's own deck. Test Bench's watches stay visible to `buyer`.
