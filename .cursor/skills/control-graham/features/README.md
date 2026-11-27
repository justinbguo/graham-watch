# Graham verification map

Demo launch and driving rules for the buyer app. The feature index is the [verify-graham map](../../verify-graham/features/README.md).

## Baseline preconditions

- Start with `node .cursor/skills/control-graham/bin/control-graham.mjs up --mode demo` unless the feature file requires **local**.
- Run `doctor` and require `looksLikeGraham: true` on the owned URL.
- Never drive a Metro/browser you did not start with `up`.
- Default viewport is 1280×900. Demo is signed in, so Buy is usable immediately. The app opens dark. A stored `graham.theme` of light, dark, or system still wins. Desktop web starts on the grid. The rail button is `Display, N per row` (N is 2 through 6). A press steps N and wraps to `Display, one at a time`, which is the card deck. `press s` toggles the two. Arrows pass and save only in card view. There is no control named `Listings per row`.
- Demo fixtures, top of the deck after shops take turns: Omega Speedmaster Professional 1972 (Vintage Vault), Seiko 6139 Pogue 1976 (Harbour Watch Co.), Rolex Datejust 1968 (Vintage Vault), Universal Genève Polerouter 1959 (Harbour Watch Co.), Heuer Autavia 1965 (Vintage Vault), Cartier Tank Must 1988 (Vintage Vault). Each shop's best watch comes before that shop's next. Demo does not apply the buyer catalogue rule. On a local stack a buyer does not see a Rolex, or a watch whose year is after 1985. A null year stays, 1985 stays, and Tudor stays.

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

The feature index is the [verify-graham map](../../verify-graham/features/README.md). Read that list, then the recipe file for the row you are proving. Demo recipes in this directory:

- [deck-swipe.md](./deck-swipe.md)
- [feedback.md](./feedback.md)
- [guest-signin.md](./guest-signin.md)
- [listing-detail.md](./listing-detail.md)
- [new.md](./new.md)
- [search.md](./search.md)
- [wishlist.md](./wishlist.md)
