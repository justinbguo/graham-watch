# Profile

Profile is the signed-in person's name, the shop they claimed if they have one, their posts, saved watches, and the shops they follow. The unseen Drops count sits at the top of Following.

## Sub-features

- `profile-page`: route `/profile`.
- `guest-gate`: signed out, the button `Log in or create an account`.
- `following`: shops the person follows, each with `Follow` or `Following`.
- `drops-count`: button `New from dealers you follow, N` when N is greater than 0.
- `settings`: the button `Open settings`.

## How to get to it (user POV)

Press the Profile tab. On a phone-width window it is the last tab and, when there are unseen drops, its accessible name is `Profile, N`. On a wide window the profile control is the photograph at the end of the header. Its accessible name stays `Profile` and does not include the count. The count on the page is the button under the heading.

## Driving it with control-graham

Preconditions:

- `up`, `seed`, and the Drops steps through `notify-drops` have run if the count should be greater than 0.
- `web` is serving port 8091.

- **Sign in and read the count.** Run `node .cursor/skills/verify-graham/control-graham.mjs screenshot /profile <evidence>/profile.png --as buyer`. The command clicks `Log in or create an account`, `Continue with email`, types `buyer@graham.test`, reads the six-digit code from Mailpit, submits `Continue`, then presses the `Profile` tab. The sheet returns to Buy, so the tab press is the way back.
- **Pass.** The button name matches `New from dealers you follow, N` with N greater than 0, and the screenshot file exists after `cleanup`.

## Gotchas

- Screenshot at 390×844 so the tab name includes the count. At 900px and wider the header profile control does not speak the number. The in-page button still does.
- `seed` sets `onboarded_at`, so Profile renders instead of onboarding.
- The Drops proof's buyer must be the account in `--as`. `quiet` may also have an unseen count and must not be the screenshot user for the push proof.
