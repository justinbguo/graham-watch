# Guest sign-in

On unsigned web, a buyer's first visit to Buy opens the sign-in sheet, once per page load. Dismiss it with `Close` or `Not now` and the deck is usable. A guest is not asked what to show. A guest's save opens the sheet again. Passes never do. Web has no header `Log in`. Demo mode is signed in, so the sheet does not appear there.

## Sub-features

- `guest-arrival-sheet` opens sign-in over Buy once per page load. The door is `Continue with email`.
- `guest-dismiss` closes that sheet with `Close` or `Not now`.
- `guest-save` opens the sheet on a right swipe, `ArrowRight`, or `Add to wishlist`. The copy is `Sign in to keep this watch on your wishlist.` The card springs back. Closing the sheet saves nothing.

## How to get to it (user POV)

- Load unsigned web in a fresh browser. The sign-in door is already up.
- The door reads `Continue with email`.
- Dismiss it, then save a watch. The sheet comes back with the save copy.
- Demo (`EXPO_PUBLIC_DEMO=1`) skips the sheet. The app treats that session as signed in.

## Driving it with control-graham

Preconditions:

- Local stack is up (`npm run db:start` or verify-graham `up`). Do not start a second stack.
- `up --mode local`, and do not run `signin`. Demo mode cannot reach this feature.

- **Arrival sheet.** After `doctor`, `snapshot` shows `Continue with email`. Do not require a control named `Log in`.
- **Dismiss.** `click --name "Close"`, then `wait-settle`. Buy is usable and the sheet is gone.
- **Save.** Switch to card view if the window is wide, then `press ArrowRight`. The sheet appears with the save copy and the same watch is still on top. `click --name "Close"` and it is still on top. Any number of `press ArrowLeft` opens nothing.
- **Proof.** `artifacts/<id>/guest-signin.*` with the sign-in sheet or Buy after dismiss.

## Gotchas

- `up --mode demo` does not show the sheet and does not show `Log in`. Reporting the demo deck as this feature is a miss.
- iOS native has no guest deck. Android shows a header `Log in` instead of the web arrival sheet.
- Closing the save sheet drops the held save. The next save asks again. Passes never ask.
- Full email OTP completion needs Mailpit or `signin <alias>`. That is a different proof.
- After a new account signs in, desktop web shows `What should we show you first?` over Buy. That is onboarding, not this gate. Seeded accounts already have `onboarded_at` set.
