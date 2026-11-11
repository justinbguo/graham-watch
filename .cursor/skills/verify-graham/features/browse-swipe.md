# Browse and swipe

Buy is the deck. A buyer passes or saves a watch. On a wide window the same watches are a grid. Guests on the web can browse, and the eleventh judgment asks them to sign in.

## Sub-features

- `deck`: the Buy tab, route `/`.
- `pass`: swipe left, or the control named `Pass`.
- `save`: swipe right. The watch lands on the Wishlist.
- `grid`: at 900px and wider the deck is a grid of tiles.
- `grid-columns`: on desktop web the rail has one button, `Display, N per row` (N is 2 through 6) or `Display, one at a time` for the card deck. A press steps the count and wraps. A phone has no column picker. At phone width the view button is `Grid` while cards are showing and `One at a time` while the grid is showing. `verify-rank` clicks those phone-width names.
- `guest-budget`: ten guest judgments, then the sign-in sheet.
- `feedback`: a link named `Feedback` on the phone header and the desktop rail. It opens an X message compose. Do not send it. It is not an inquiry.

## How to get to it (user POV)

Open the app. Web guests land on Buy with a short taste sheet (`What should we show you first?`). `Skip` or `See watches` dismisses it. The sign-in sheet then opens, once per page load. Dismiss that with `Close` or `Not now` before judging a watch. Web has no header `Log in`. Android shows `Log in`. iOS shows the sign-in wall first. Search is the field named `Search brand, model or reference`. Filters open from the filter control.

## Driving it with control-graham

Preconditions:

- `up` and `web` are ready. The seeded catalogue from `supabase/seed.sql` is on the deck. Test Bench's shelf listing is there too once `seed` has run.

- **Open Buy.** Run `node .cursor/skills/verify-graham/control-graham.mjs screenshot / <evidence>/buy.png`. The shot is the deck or the guest gate, not a proof of a swipe.
- **Rank.** Run `node .cursor/skills/verify-graham/control-graham.mjs verify-rank` after `seed` and `web`. The order is `rank_buy_feed`: a dealer click outweighs a save, a pass is a mild negative, an undo does not count, and a followed shop is boosted. The command picks Rolex, dismisses sign-in, signs in as `buyer`, clicks another brand's dealer link, reloads, then follows Test Bench and imports the fixture. The click is a `log_buyer_events` post, and the command fails if that post did not succeed. After the guest feed and again after the follow, it opens the grid and scrolls until the next page loads. Evidence is `guest-taste.png`, `guest-feed.png`, `guest-page.png`, `ranked-feed.png`, `followed-feed.png`, `buyer-page.png`, and `rank-buy.webm`.
- **Pass and save are not harness commands yet.** A swipe has to happen in the browser. Do not treat a Drops screenshot as proof that pass and save work.

## Gotchas

- `screenshot /` signs in as the named user, then waits for the line `N watches available`. A web guest sees the taste sheet first. After `Skip` or `See watches`, Buy opens the sign-in sheet, so the email door can already be visible.
- Demo mode (`EXPO_PUBLIC_DEMO=1`) never hits this stack. Do not export the web build with that variable set.
- A claimed shop is hidden from the dealer's own deck. Test Bench's watches stay visible to `buyer`.
- Opening a tile shows `View on dealer site` when that watch has a source URL. Pass and save on the wide grid still happen from card view, or from that listing.
