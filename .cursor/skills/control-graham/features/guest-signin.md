# Guest sign-in gate

On web, guests use the deck without an account. **Log in** in the header opens sign-in on purpose. After ten judgments (`GUEST_SWIPE_BUDGET`), the sign-in sheet opens itself.

## Sub-features

- `guest-login-control` shows Log in on Buy for signed-out web.
- `guest-open-sheet` opens the sign-in sheet from Log in.
- `guest-budget` opens the sheet after ten pass/save actions.

## How to get to it (user POV)

- Load the web app signed out (demo default).
- Choose **Log in**, or keep passing/saving until the budget sheet appears.

## Driving it with control-graham

Preconditions:

- Demo web run, signed out (default).

- **Log in control.** On Buy, `snapshot` / `screenshot` includes a control named `Log in`.
- **Open sheet.** `click --name "Log in"`, `wait-settle`. Sign-in UI shows the Graham wordmark / email door (accessible names vary; require visible sign-in copy or email field).
- **Budget (optional, slower).** From a fresh run, `press ArrowLeft` or `ArrowRight` ten times. After the tenth, the sign-in sheet appears without pressing Log in.
- **Proof.** `artifacts/<id>/guest-signin.*` with the sheet or Log in control visible.

## Gotchas

- iOS native has no guest deck; this feature is web (and Android guest behavior may differ). Agents verifying in demo web are correct for this file.
- Closing the sheet and continuing is product behavior; do not treat "sheet dismissed" as "budget reset".
- Full email OTP completion needs **local** Mailpit or `signin <alias>` — out of scope for demo.
