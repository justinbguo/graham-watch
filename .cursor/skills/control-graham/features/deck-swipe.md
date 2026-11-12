# Deck pass and save

Buy shows a deck of watches. On web, ArrowLeft passes and ArrowRight saves. Passing advances the deck; saving keeps the watch for Wishlist and advances.

## Sub-features

- `deck-show` shows a real fixture watch on Buy after launch.
- `deck-pass` removes the top watch via ArrowLeft.
- `deck-save` keeps the top watch via ArrowRight (wishlist side effect covered in wishlist.md).
- `deck-undo` restores the last pass when Undo is available.
- `deck-columns` on desktop web is one rail button: `Display, N per row` while the grid is showing (N is 2 through 6), and `Display, one at a time` for the card deck. A press steps the count and wraps.

## How to get to it (user POV)

- Land on Buy (`/`) after `up --mode demo`. Demo is signed in, so no sign-in sheet covers the deck.
- Press ArrowLeft to pass, ArrowRight to save (focus not in a text field, and the view is cards).
- Optionally press the Undo control (`Undo, bring back the watch you passed on`) after a pass.

## Driving it with control-graham

Preconditions:

- `up --mode demo` succeeded and `doctor` reports `looksLikeGraham: true`.
- Buy is the focused tab (`home` if unsure).
- At least two watches remain (fresh run).

- **Show top watch.** At 1280×900 the grid is already showing. Switch to card view with `press s`, or press the Display button until its name is `Display, one at a time`. Run `snapshot` and/or `screenshot`. The page names a demo watch (e.g. `Omega Speedmaster Professional` or `Speedmaster`) and Buy chrome.
- **Pass.** Run `press ArrowLeft`, then `wait-settle`. Snapshot: the previous top title is gone; a different watch is visible (or empty-deck copy if the deck was exhausted).
- **Save.** From a fresh top card, run `press ArrowRight`, then `wait-settle`. Snapshot: the top card advanced. Wishlist proof belongs in [wishlist.md](./wishlist.md).
- **Undo pass.** After a pass, run `click --name "Undo, bring back the watch you passed on"` (or `aria-click --role button --name "Undo"`). Snapshot: the passed watch is back on top.
- **Proof.** Write `snapshot` to `artifacts/<id>/deck-swipe.aria.yml` and `screenshot` to `artifacts/<id>/deck-swipe.png` after the action under test.

## Gotchas

- Focus in a text field eats arrow keys (`isTypingTarget`). `home` and click Buy first.
- Desktop web at the keeper's 1280px viewport starts on the grid. `press s` toggles card and grid. The rail button is `Display, N per row` or `Display, one at a time`. There is no control named `Listings per row`, `Card View`, or `Switch to card view`. On the grid, arrows move selection instead of judging.
- A phone-width window uses `Grid` and `One at a time` instead of Display. That is the verify-graham viewport, not this demo keeper.
- Demo is signed in, so the ten-swipe sign-in gate does not open. Unsigned web shows the sign-in sheet. Dismiss that with `Close` or `Not now` before arrows, and the gate returns after 10 judgments.
- Demo reload clears passes/saves. Do not use reload as proof of persistence.
