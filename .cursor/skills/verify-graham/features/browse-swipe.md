# Browse and swipe

Buy is the deck. A buyer passes or saves a watch. On a wide window the same watches are a grid. A personal score picks the watches, then shops take turns: each shop's best watch, then each shop's next, and inside a shop the brands take turns. Guests on the web can browse and pass as much as they like. A guest's save asks them to sign in.

## Sub-features

- `deck`: the Buy tab, route `/`.
- `pass`: swipe left, or the control named `Pass`.
- `save`: swipe right. The watch lands on the Wishlist.
- `grid`: at 900px and wider the deck is a grid of tiles. The shop name sits on the photograph. The shop icon is there when the shop has a logo. A missing or failed icon leaves the name alone.
- `grid-columns`: on desktop web the rail has one button, `Display, N per row` (N is 2 through 6) or `Display, one at a time` for the card deck. A press steps the count and wraps. A phone has no column picker. At phone width the view button is `Grid` while cards are showing and `One at a time` while the grid is showing. `verify-rank` clicks those phone-width names.
- `guest-save`: a guest's save opens the sign-in sheet and the card stays. After sign-in that watch is on the Wishlist. Closing the sheet saves nothing.
- `filters`: the control is `Filters`. The groups run Price, Era, Case size, Dealer, Brand. Dealer is above Brand. The desktop first-run sheet uses this panel with Dealer omitted.
- `shop-scope`: on desktop web the rail lists shops under the tools. The heading is Dealers. The button is `<shop>, verified`. A press limits the deck to that shop. A second press on that same shop clears the limit. The deck then shows that shop's name, or the word Dealer, and the button `All watches`, on the grid and in card view. The label is never the shop id. While that shop is selected the filter control is `Filters, 1 active`. After the second press it is `Filters` again.
- `events`: a pass, a save, an undo, an unsave, and a dealer click each flush to `log_buyer_events` immediately. Rank reads those rows. An undo takes the pass back off the score and adds no weight of its own.
- `feedback`: a link named `Feedback` on the phone header and the desktop rail, and on New as well as Buy. It opens an X message compose. Do not send it. It is not an inquiry. The web sign-in sheet does not include it.

## How to get to it (user POV)

Open the app. Web guests land on Buy with the sign-in sheet already open. Dismiss it with `Close` or `Not now` before judging a watch. A guest is not asked what to show. Web has no header `Log in`. Android shows `Log in`. iOS shows the sign-in wall first. Search is the button named `Search brand, model or reference`. Filters open from `Filters`. Inside, Dealer sits above Brand, after Price, Era, and Case size.

## Driving it with control-graham

Preconditions:

- `up` and `web` are ready. The seeded catalogue from `supabase/seed.sql` is on the deck, except a Rolex and a watch whose year is after 1985. Test Bench's shelf listing is there too once `seed` has run.

- **Open Buy.** Run `node .cursor/skills/verify-graham/control-graham.mjs screenshot / <evidence>/buy.png`. The shot is the deck or the guest gate, not a proof of a swipe.
- **Rank.** Run `node .cursor/skills/verify-graham/control-graham.mjs verify-rank` after `seed` and `web`. The order is `rank_buy_feed`: a dealer click outweighs a save, a pass is a mild negative, an undo does not count, and a followed shop is boosted. Shops then take turns, so one shop's second watch waits behind the other shops' first. The command screenshots the sign-in sheet, dismisses it, browses as a guest, signs in as `buyer`, clicks a dealer link, reloads, then follows Test Bench and imports the fixture. The click is a `log_buyer_events` post, and the command fails if that post did not succeed. After the guest feed and again after the follow, it opens the grid and scrolls until the next page loads. Evidence is `guest-taste.png` (the sign-in sheet, before dismiss; the filename is unchanged), `guest-feed.png`, `guest-page.png`, `ranked-feed.png`, `followed-feed.png`, `buyer-page.png`, and `rank-buy.webm`.
- **Guest save.** Run `node .cursor/skills/verify-graham/control-graham.mjs verify-guest-save` after `up`, `seed`, and `web`. A guest on a wide window saves, dismisses, passes, saves again, and follows the email link. The new tab shares the held save. The link opens a new account on Buy. A name and Continue, then Skip finishes "What should we show you first?", and Wishlist shows that watch. Evidence is `guest-deck.png`, `save-prompt.png`, `dismissed.png`, `after-pass.png`, `first-run.png`, `wishlist.png`, and `guest-save.webm`.

## Gotchas

- `screenshot /` signs in as the named user, then waits for the line `N watches available`. A web guest sees the sign-in sheet first, so the email door can already be visible.
- Demo mode (`EXPO_PUBLIC_DEMO=1`) never hits this stack. Do not export the web build with that variable set.
- A claimed shop is hidden from the dealer's own deck. Test Bench's watches stay visible to `buyer`. Importing a watch does not hide it.
- A signed-in pass or save is a row in `swipes`, so a later fetch does not return that watch. A guest's pass is not stored, so a new session shows that watch again.
- Opening a tile shows `View on dealer site` when that watch has a source URL. Pass and save on the wide grid still happen from card view, or from that listing.
- `npm run report:shop-mix` prints how many shops are in the first 20 and the first 50 of Buy and New. It reads with the anon key and writes nothing. Point it at the local stack.
