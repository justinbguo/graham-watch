# Wishlist

Wishlist lists watches the buyer saved (right-swipe / ArrowRight). The tab badge count updates with saves.

## Sub-features

- `wishlist-empty` shows an empty state when nothing is saved.
- `wishlist-after-save` lists a watch saved from the deck.
- `wishlist-open-listing` opens a saved watch's listing from the row.

## How to get to it (user POV)

- Save at least one watch from Buy (ArrowRight).
- Choose the Wishlist tab in the tab bar.

## Driving it with control-graham

Preconditions:

- Demo run with `doctor` green.
- At least one save this session (`press ArrowRight` on Buy), or accept empty-state proof only.

- **Empty state (optional).** On a fresh run before any save, `click --name Wishlist`, then `snapshot`. Empty-state copy is visible; no Omega/Rolex row required.
- **Save then open.** From Buy, `press ArrowRight` on a known fixture (note its title from snapshot). `click --name Wishlist` (badge may read `Wishlist, 1`). Snapshot includes that title.
- **Open listing.** `aria-click --role button --name "<formatTitle>"` or click the row's accessible name matching the watch. Listing route shows the same title.
- **Proof.** `screenshot` / `snapshot` under `artifacts/<id>/wishlist.*` with the saved title visible.

## Gotchas

- Tab label is `Wishlist` (spoken badge: `Wishlist, N`). Match that name.
- Demo wishlist is session memory only.
- Removing from wishlist uses a swipe-to-reveal control; the destructive tap is a second step — do not treat a swipe alone as delete.
