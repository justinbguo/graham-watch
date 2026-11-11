# Guest sign-in

On unsigned web, a buyer's first visit to Buy shows `What should we show you first?`. `Skip` or `See watches` dismisses it. The sign-in sheet then opens, once per page load. Dismiss that with `Close` or `Not now` and the deck is usable. After ten judgments (`GUEST_SWIPE_BUDGET`), the sheet opens again. Web has no header `Log in`. Demo mode is signed in, so neither sheet appears there.

## Sub-features

- `guest-taste` is the first sheet: heading `What should we show you first?`, buttons `Skip` and `See watches`.
- `guest-arrival-sheet` opens sign-in over Buy after the taste sheet, once per page load.
- `guest-dismiss` closes that sheet with `Close` or `Not now`.
- `guest-budget` opens the sheet after ten pass/save actions. The budget copy is `Sign in to keep swiping, save watches, and message dealers.`

## How to get to it (user POV)

- Load unsigned web in a fresh browser. The taste sheet is up. The sign-in door is not, until `Skip` or `See watches`.
- After that, the door reads `Continue with email`.
- Dismiss it, then pass or save until the budget sheet appears.
- Demo (`EXPO_PUBLIC_DEMO=1`) skips both sheets. The app treats that session as signed in.

## Driving it with control-graham

Preconditions:

- Local stack is up (`npm run db:start` or verify-graham `up`). Do not start a second stack.
- `up --mode local`, and do not run `signin`. Demo mode cannot reach this feature.

- **Taste sheet.** After `doctor`, `snapshot` shows `What should we show you first?`. `click --name Skip` (or `See watches`), then `wait-settle`.
- **Arrival sheet.** `snapshot` shows `Continue with email`. Do not require a control named `Log in`.
- **Dismiss.** `click --name "Close"`, then `wait-settle`. Buy is usable and the sheet is gone.
- **Budget (optional, slower).** Switch to card view if the window is wide, then `press ArrowLeft` or `ArrowRight` ten times. After the tenth, the sheet appears again.
- **Proof.** `artifacts/<id>/guest-signin.*` with the taste sheet, the sign-in sheet, or Buy after dismiss.

## Gotchas

- `up --mode demo` does not show either sheet and does not show `Log in`. Reporting the demo deck as this feature is a miss.
- A fresh `up` uses a new browser context, so the taste sheet is first. A context that already stored `graham.taste` skips it and shows the sign-in sheet.
- iOS native has no guest deck. Android shows a header `Log in` instead of the web arrival sheet.
- Closing the sheet does not reset the swipe budget. The sheet stays dismissed on that page load until the budget asks.
- Full email OTP completion needs Mailpit or `signin <alias>`. That is a different proof.
