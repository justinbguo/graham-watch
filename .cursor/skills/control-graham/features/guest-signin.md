# Guest sign-in

On unsigned web, a buyer's first visit to Buy opens the sign-in sheet, once per page load. Dismiss it with `Close` or `Not now` and the deck is usable. A guest is not asked what to show. After ten judgments (`GUEST_SWIPE_BUDGET`), the sheet opens again. Web has no header `Log in`. Demo mode is signed in, so the sheet does not appear there.

## Sub-features

- `guest-arrival-sheet` opens sign-in over Buy once per page load. The door is `Continue with email`.
- `guest-dismiss` closes that sheet with `Close` or `Not now`.
- `guest-budget` opens the sheet after ten pass/save actions. The budget copy is `Sign in to keep swiping, save watches, and message dealers.`

## How to get to it (user POV)

- Load unsigned web in a fresh browser. The sign-in door is already up.
- The door reads `Continue with email`.
- Dismiss it, then pass or save until the budget sheet appears.
- Demo (`EXPO_PUBLIC_DEMO=1`) skips the sheet. The app treats that session as signed in.

## Driving it with control-graham

Preconditions:

- Local stack is up (`npm run db:start` or verify-graham `up`). Do not start a second stack.
- `up --mode local`, and do not run `signin`. Demo mode cannot reach this feature.

- **Arrival sheet.** After `doctor`, `snapshot` shows `Continue with email`. Do not require a control named `Log in`.
- **Dismiss.** `click --name "Close"`, then `wait-settle`. Buy is usable and the sheet is gone.
- **Budget (optional, slower).** Switch to card view if the window is wide, then `press ArrowLeft` or `ArrowRight` ten times. After the tenth, the sheet appears again.
- **Proof.** `artifacts/<id>/guest-signin.*` with the sign-in sheet or Buy after dismiss.

## Gotchas

- `up --mode demo` does not show the sheet and does not show `Log in`. Reporting the demo deck as this feature is a miss.
- iOS native has no guest deck. Android shows a header `Log in` instead of the web arrival sheet.
- Closing the sheet does not reset the swipe budget. The sheet stays dismissed on that page load until the budget asks.
- Full email OTP completion needs Mailpit or `signin <alias>`. That is a different proof.
- After a new account signs in, desktop web shows `What should we show you first?` over Buy. That is onboarding, not this gate. Seeded accounts already have `onboarded_at` set.
