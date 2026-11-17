# Deck pass and save

Buy shows a deck of watches. On web, ArrowLeft passes and ArrowRight saves. Passing advances the deck; saving keeps the watch for Wishlist and advances. With no taste saved yet, shops take turns, so the top of the demo deck is Omega, then the Seiko from Harbour Watch Co., then the Rolex.

## Sub-features

- `deck-show` shows a real fixture watch on Buy after launch.
- `deck-pass` removes the top watch via ArrowLeft.
- `deck-save` keeps the top watch via ArrowRight (wishlist side effect covered in wishlist.md).
- `deck-undo` restores the last pass when Undo is available.
- `deck-columns` on desktop web is one rail button: `Display, N per row` while the grid is showing (N is 2 through 6), and `Display, one at a time` for the card deck. A press steps the count and wraps.
- `deck-filters`: the control `Filters` opens Price, Era, Case size, Dealer, then Brand. Dealer is above Brand.
- `deck-shop`: the desktop rail heading is Dealers. The button is `<shop>, verified`. A press limits Buy to that shop. A second press on that same shop clears the limit. The deck then shows that shop's name, or the word Dealer, and `All watches`, on the grid and in card view. The label is never the shop id. While that shop is selected the filter control is `Filters, 1 active`. After the second press it is `Filters` again. On the grid, the shop name sits on the photograph, with the shop icon when the shop has a logo. Demo shops have no logo, so the name stands alone.

## How to get to it (user POV)

- Land on Buy (`/`) after `up --mode demo`. Demo is signed in, so no sign-in sheet covers the deck.
- Press ArrowLeft to pass, ArrowRight to save (focus not in a text field, and the view is cards).
- Optionally press the Undo control (`Undo, bring back the watch you passed on`) after a pass.

## Driving it with control-graham

Preconditions:

- `up --mode demo` succeeded and `doctor` reports `looksLikeGraham: true`.
- Buy is the focused tab (`home` if unsure).
- At least two watches remain (fresh run).

- **Show top watch.** At 1280×900 the grid is already showing. The first tile is Omega and the second is Seiko 6139 Pogue. Switch to card view with `press s`, or press the Display button until its name is `Display, one at a time`. Run `snapshot` and/or `screenshot`. The page names `Omega Speedmaster Professional` and Buy chrome.
- **Pass.** Run `press ArrowLeft`, then `wait-settle`. Snapshot: the previous top title is gone; a different watch is visible (or empty-deck copy if the deck was exhausted).
- **Save.** From a fresh top card, run `press ArrowRight`, then `wait-settle`. Snapshot: the top card advanced. Wishlist proof belongs in [wishlist.md](./wishlist.md).
- **Undo pass.** After a pass, run `click --name "Undo, bring back the watch you passed on"` (or `aria-click --role button --name "Undo"`). Snapshot: the passed watch is back on top.
- **Filters.** `click --name Filters`, then `snapshot`. The dialog lists Price, Era, Case size, Dealer, then Brand. The visible rail word is Filter. The accessible name is `Filters` until a shop or another filter is on, when it becomes `Filters, N active`. Close it with `press Escape`. `Close filters` is the full-screen backdrop, and a center click lands on the panel instead of dismissing it.
- **Proof.** Write `snapshot` to `artifacts/<id>/deck-swipe.aria.yml` and `screenshot` to `artifacts/<id>/deck-swipe.png` after the action under test.

## Gotchas

- Focus in a text field eats arrow keys (`isTypingTarget`). `home` and click Buy first.
- Desktop web at the keeper's 1280px viewport starts on the grid. `press s` toggles card and grid. The rail button is `Display, N per row` or `Display, one at a time`. There is no control named `Listings per row`, `Card View`, or `Switch to card view`. On the grid, arrows move selection instead of judging.
- A phone-width window uses `Grid` and `One at a time` instead of Display. That is the verify-graham viewport, not this demo keeper.
- Demo is signed in, so a save never opens the sign-in sheet. Unsigned web shows the sign-in sheet. Dismiss that with `Close` or `Not now` before arrows. As a guest, `ArrowRight` opens the sheet again and the card stays on top.
- Demo reload clears passes/saves. Do not use reload as proof of persistence.
