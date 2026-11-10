# Wishlist

Wishlist lists watches the buyer saved (right-swipe / ArrowRight). The tab badge count updates with saves.

## Sub-features

- `wishlist-empty` shows an empty state when nothing is saved.
- `wishlist-after-save` lists a watch saved from the deck.
- `wishlist-open-listing` is the photograph. That control is omitted from the accessibility tree. The named buttons are `Message the dealer about <title>`, `Inquire about <title>`, and `View on dealer site` when the listing has a source URL.

## How to get to it (user POV)

- Save at least one watch from Buy (ArrowRight).
- Choose the Wishlist tab in the tab bar.

## Driving it with control-graham

Preconditions:

- Demo run with `doctor` green.
- At least one save this session (`press ArrowRight` on Buy), or accept empty-state proof only.

- **Empty state (optional).** On a fresh run before any save, `click --name Wishlist`, then `snapshot`. Empty-state copy is visible; no Omega/Rolex row required.
- **Save then open.** From Buy, `press ArrowRight` on a known fixture (note its title from snapshot). `click --name Wishlist` (badge may read `Wishlist, 1`). Snapshot includes that title.
- **Row name.** The button is `Message the dealer about <title>`, not the title alone. That press opens a thread. `View on dealer site` is a separate button when the watch has a source URL. Proof that the watch was saved is the message button's name in the snapshot, and the tab `Wishlist, N`.
- **Proof.** `screenshot` / `snapshot` under `artifacts/<id>/wishlist.*` with the saved title visible.

## Gotchas

- Tab label is `Wishlist` (spoken badge: `Wishlist, N`). The count is saves that still need a first message to the dealer, not every saved watch.
- Demo wishlist is session memory only.
- Removing from wishlist uses a swipe-to-reveal control; the destructive tap is a second step — do not treat a swipe alone as delete.
