# Listing detail

Opening a watch from the grid shows its photograph, title, price, and dealer context. Pass, Add to wishlist, and `View on dealer site` sit on that screen. Demo listings have a source URL, so the dealer-site button is present. The card deck shows the same details inside the card and does not open this screen.

## Sub-features

- `listing-open-from-deck` opens the top watch's detail.
- `listing-identity` shows brand/model/year consistent with the deck card.
- `listing-back` returns to Buy with the control named `Close`.

## How to get to it (user POV)

- On the grid, open the listing with `Open listing` (one photograph) or the watch's title. On web, a tile with several photographs uses `Listing photos`.
- The card deck does not open this screen. Wishlist's photograph does, and that photograph is omitted from the accessibility tree. The row's button is `Message the dealer about <title>`.

## Driving it with control-graham

Preconditions:

- Demo `doctor` green. Dismiss the arrival sheet. Use the grid (`press s` until the control offers card view, which means the grid is showing).

- **Open.** From the grid, `aria-click --role button --name "Open listing"`, or click the button named with the watch's title. `wait-settle`.
- **Identity.** `snapshot`: title matches `formatTitle` (e.g. `Omega Speedmaster Professional, 1972`), a price appears, and `View on dealer site` is present.
- **Back.** `aria-click --role button --name "Close"` or `home`. Buy is usable again. There is no control named `Back`.
- **Proof.** `artifacts/<id>/listing.*` showing the title on the detail screen.

## Gotchas

- Demo listing photos load from `picsum.photos`; a blank photo with a correct title is still identity proof — note network failure separately via `network-summary`.
- Do not require dealer claim or messaging to pass this feature in demo.
