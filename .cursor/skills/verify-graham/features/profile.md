# Profile

Profile is the signed-in person's name and portrait, the shop they claimed if they have one, their posts, their wishlist, and the shops they follow. Someone with no photo sees the bundled portrait. New watches from those shops are in Messages, not here. The app opens dark.

## Sub-features

- `profile-page`: route `/profile`.
- `guest-gate`: signed out, the button `Log in or create an account`.
- `following`: shops the person follows, each with `Follow` or `Following`. The row name is `<shop>, verified`.
- `settings`: the button `Open settings`. The name field is `Your name`, and `Save` stays off until the name changes. Over 80 characters shows `Use 80 characters or fewer.` Appearance is `System`, `Light`, or `Dark`. The app opens dark. A stored `graham.theme` of light, dark, or system still wins.

## How to get to it (user POV)

Press the Profile tab. On a phone-width window it is the last tab and its accessible name is `Profile`. The Following list is on this screen. It does not say how many new watches a shop has.

## Driving it with control-graham

Preconditions:

- `up` and `seed` have run. Follow Test Bench first if the list should contain that shop.
- `web` is serving port 8091.

- **Sign in and read Following.** Run `node .cursor/skills/verify-graham/control-graham.mjs screenshot /profile <evidence>/profile.png --as buyer`. The command clicks `Log in or create an account` when that gate is up, then `Continue with email`, types `buyer@graham.test`, clicks `Send me a code`, reads the six-digit code from Mailpit, submits `Continue`, then presses the `Profile` tab. The sheet returns to Buy, so the tab press is the way back.
- **Pass.** The button name is `Test Bench, verified` after a follow. There is no button `New from dealers you follow`, and the Profile tab has no count. The screenshot file exists after `cleanup`.

## Gotchas

- The drops count is on the Messages tab. A Profile screenshot that finds `Profile, N` means the move regressed.
- The portrait is the person's picture. A shop row uses the shop's mark. A missing shop logo does not become the portrait.
- Settings does not list Payment & shipping or Backend. Profile does not show `Do you run a shop listed here?`.
- `seed` sets `onboarded_at`, so Profile renders instead of onboarding.
- The Drops proof's buyer must be the account in `--as`. `quiet` may also have an unseen count and must not be the screenshot user for the push proof.
