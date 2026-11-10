# Browse and swipe

Buy is the deck. A buyer passes or saves a watch. On a wide window the same watches are a grid. Guests on the web can browse, and the eleventh judgment asks them to sign in.

## Sub-features

- `deck`: the Buy tab, route `/`.
- `pass`: swipe left, or the control named `Pass`.
- `save`: swipe right. The watch lands on the Wishlist.
- `grid`: at 900px and wider the deck is a grid of tiles.
- `grid-columns`: on desktop web, while that grid is showing, the rail offers `Listings per row`. The radios are `2 listings per row` through `6 listings per row`. A phone stays at two and has no picker.
- `guest-budget`: ten guest judgments, then the sign-in sheet.

## How to get to it (user POV)

Open the app. Web guests land on Buy with the sign-in sheet already open, once per page load. Dismiss it with `Close` or `Not now` before judging a watch. Web has no header `Log in`. Android shows `Log in`. iOS shows the sign-in wall first. Search is the field named `Search brand, model or reference`. Filters open from the filter control.

## Driving it with control-graham

Preconditions:

- `up` and `web` are ready. The seeded catalogue from `supabase/seed.sql` is on the deck. Test Bench's shelf listing is there too once `seed` has run.

- **Open Buy.** Run `node .cursor/skills/verify-graham/control-graham.mjs screenshot / <evidence>/buy.png`. The shot is the deck or the guest gate, not a proof of a swipe.
- **Pass and save are not harness commands yet.** A swipe has to happen in the browser. Do not treat a Drops screenshot as proof that pass and save work.

## Gotchas

- `screenshot /` signs in as the named user, then waits for the line `N watches available`. Buy opens the sign-in sheet on its own for a web guest, so the email door can already be visible.
- Demo mode (`EXPO_PUBLIC_DEMO=1`) never hits this stack. Do not export the web build with that variable set.
- A claimed shop is hidden from the dealer's own deck. Test Bench's watches stay visible to `buyer`.
- Opening a tile shows `View on dealer site` when that watch has a source URL. Pass and save on the wide grid still happen from card view, or from that listing.
