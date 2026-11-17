# Graham verification map

Maintained source for verifying buyer-facing behavior. Read this index, then the matching feature file.

## Baseline preconditions

- Start with `node .cursor/skills/control-graham/bin/control-graham.mjs up --mode demo` unless the feature file requires **local**.
- Run `doctor` and require `looksLikeGraham: true` on the owned URL.
- Never drive a Metro/browser you did not start with `up`.
- Default viewport is 1280×900. Demo is signed in, so Buy is usable immediately. The app opens dark. A stored `graham.theme` of light, dark, or system still wins. Desktop web starts on the grid. The rail button is `Display, N per row` (N is 2 through 6). A press steps N and wraps to `Display, one at a time`, which is the card deck. `press s` toggles the two. Arrows pass and save only in card view. There is no control named `Listings per row`.
- Demo fixtures, top of the deck after shops take turns: Omega Speedmaster Professional 1972 (Vintage Vault), Seiko 6139 Pogue 1976 (Harbour Watch Co.), Rolex Datejust 1968 (Vintage Vault), Universal Genève Polerouter 1959 (Harbour Watch Co.), Heuer Autavia 1965 (Vintage Vault), Cartier Tank Must 1988 (Vintage Vault). Each shop's best watch comes before that shop's next.

## Driving conventions

- Prefer accessible names and roles; on the deck prefer `press ArrowLeft` / `ArrowRight`.
- Start every recipe from a fresh `up` unless the feature says otherwise.
- Restore nothing in demo (reload clears in-memory swipes). On local, `seed` is the reset.
- Keep proof artifacts under `artifacts/<run-id>/`; `cleanup` must not remove them.

## Proof and skip reporting

- Capture action + resulting state.
- UI proof: aria snapshot and/or screenshot with Graham chrome and the watch identity visible.
- Report an unreachable path with the unmet precondition; do not mark it verified via a different entry point.

## Features

- [Deck pass and save](./deck-swipe.md) — keyboard pass/save on Buy.
- [Wishlist](./wishlist.md) — saved watches appear under Wishlist.
- [Search](./search.md) — catalogue search door and query.
- [Listing detail](./listing-detail.md) — open a watch from the grid.
- [New](./new.md). The latest catalogue batch. Opening the tab clears the count on this device until a later seal. Not the Drops feed.
- [Feedback](./feedback.md) — the Feedback link on Buy. Do not send the message.
- [Guest sign-in gate](./guest-signin.md) — the sign-in sheet on unsigned local web. Demo does not show it.
