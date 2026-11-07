# Onboarding

A new account answers a name, a username, a birthday, how many watches they own, which brands they like, what makes hunting hard, and whether they want alerts. Someone under 18 stops on the blocked step and is not onboarded.

## Sub-features

- `name`: the heading `What should we call you?`
- `username`: the @ handle, checked before the next step.
- `birthday`: three wheels. Under 18 goes to `You need to be 18 to use Graham`.
- `questions`: collection size, brands, and hunting difficulty. Continue stays off until an answer is chosen.
- `alerts`: `Stay close to the watches you care about`, then the account is onboarded.

## How to get to it (user POV)

Sign in with an email that has no finished profile. The app leaves the deck and shows the first question. There is no step counter and no Skip. Back is the arrow above the heading, except on the first slide and the blocked slide.

## Driving it with control-graham

Preconditions:

- Local stack is healthy.
- The signed-in profile has `onboarded_at` null. `seed` sets `onboarded_at`, so `buyer`, `quiet`, and `dealer` never see this flow.

- **Reach the gate.** This harness does not create a half-finished account. `sign-in buyer` then `screenshot /onboarding ... --as buyer` lands on the app, not the questions, because that profile is already onboarded.
- **Do not call that a pass.** The Drops proof does not cover onboarding. Report this feature unverified until a drive uses an account whose `onboarded_at` is null and the heading `What should we call you?` is on screen.

## Gotchas

- `seed` finishes onboarding on purpose so Profile can be screenshotted. That precondition makes this journey fail if you reuse those accounts.
- The birthday trigger rejects `onboarded_at` without an adult `date_of_birth` and an `account_type`. A patched row that skips the wheels is not the user path.
- Web copy on the alerts step says push is a mobile prompt. Continue still finishes the profile.
