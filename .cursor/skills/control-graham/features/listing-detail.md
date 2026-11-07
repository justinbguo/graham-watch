# Listing detail

Opening a watch shows its photograph, title, price, and dealer context. Pass/save also exist on the listing for guests and signed-in buyers.

## Sub-features

- `listing-open-from-deck` opens the top watch's detail.
- `listing-identity` shows brand/model/year consistent with the deck card.
- `listing-back` returns to Buy without crashing.

## How to get to it (user POV)

- On the card or grid, open the listing (tap the photograph / `Open listing` where labeled).
- From Wishlist, open a saved row.

## Driving it with control-graham

Preconditions:

- Demo `doctor` green. Prefer card view (`press s` until cards, or click the control that offers card view).

- **Open.** From Buy, `aria-click --role button --name "Open listing"` or click the title control for the visible watch. `wait-settle`.
- **Identity.** `snapshot`: title matches `formatTitle` (e.g. `Omega Speedmaster Professional, 1972`) and a price appears.
- **Back.** Use the screen back control (`aria-click --role button --name "Back"` if present) or `home`. Buy is usable again.
- **Proof.** `artifacts/<id>/listing.*` showing the title on the detail screen.

## Gotchas

- Demo listing photos load from `picsum.photos`; a blank photo with a correct title is still identity proof — note network failure separately via `network-summary`.
- Do not require dealer claim or messaging to pass this feature in demo.
