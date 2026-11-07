# Graham verification map

Maintained source for verifying buyer-facing behavior. Read this index, then the matching feature file.

## Baseline preconditions

- Start with `node .cursor/skills/verify-graham/bin/control-graham.mjs up --mode demo` unless the feature file requires **local**.
- Run `doctor` and require `looksLikeGraham: true` on the owned URL.
- Never drive a Metro/browser you did not start with `up`.
- Default viewport is 1280×900 (desktop web: grid/rail chrome may appear; arrows still pass/save on the card stage when Buy is focused).
- Demo fixtures (top of deck order): Omega Speedmaster Professional 1972, Rolex Datejust 1968, Heuer Autavia 1965, Seiko 6139 Pogue 1976, Universal Genève Polerouter 1959, Cartier Tank Must 1988.

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
- [Listing detail](./listing-detail.md) — open a watch from the deck/grid.
- [Guest sign-in gate](./guest-signin.md) — Log in control and budget sheet (demo/web).
