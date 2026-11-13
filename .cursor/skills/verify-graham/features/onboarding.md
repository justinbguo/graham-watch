# Onboarding

A new account finishes once, after sign-in. On desktop web that is one sheet over Buy with two steps. First `What should we call you?` on one line, then `What should we show you first?`, the same filter panel as Filter with the shops left out, then `Skip` or `See watches`. On a phone, and on a web window narrower than 900px, the app leaves the deck for a name, a username, a birthday, how many watches they own, which brands they like, what makes hunting hard, and whether they want alerts. Someone under 18 stops on the blocked step and is not onboarded. A guest is not asked any of this.

## Sub-features

- `desktop-name`: heading `What should we call you?`, one line labelled `Your name`. `Continue` stays off until a name is typed. Over 80 characters shows `Use 80 characters or fewer.` There is no Skip on this step.
- `desktop-first-run`: heading `What should we show you first?`, with a `Back` arrow to the name. `Skip` clears the picks. `See watches` keeps the brands that are checked. Either button writes the name and finishes the profile with no birthday and no username.
- `name`: the phone heading `What should we call you?`
- `username`: the phone heading `Create a username`. The handle is claimed before the next step.
- `birthday`: three wheels. Under 18 goes to `You need to be 18 to use Graham`.
- `questions`: collection size, brands, and hunting difficulty. Continue stays off until an answer is chosen. These slides have no Skip.
- `alerts`: `Stay close to the watches you care about`. `Not now` or the permission prompt finishes the phone flow.

## How to get to it (user POV)

Sign in with an email that has no finished profile. Desktop web stays on Buy and shows the sheet. A phone replaces the deck with the first question. There is no step counter. On the phone, Back is the arrow above the heading, except on the first slide and the blocked slide.

## Driving it with control-graham

Preconditions:

- Local stack is healthy.
- The signed-in profile has `onboarded_at` null. `seed` sets `onboarded_at`, so `buyer`, `quiet`, and `dealer` never see this flow.

- **Reach the gate.** `screenshot` is 390px wide and signs the seeded accounts in, so it lands on the app rather than the questions.
- **Desktop sheet.** On a stack this run started, `node .cursor/skills/control-graham/bin/control-graham.mjs up --mode local` and do not `signin`. The keeper is 1280px wide. `click --name "Continue with email"`, `fill --name "you@example.com" --value` a new mailbox, `click --name "Send me a code"`. Local web reads Mailpit and can finish sign-in before a hand-typed code. The sheet reads `What should we call you?`. `fill --name "Your name" --value` a name, `click --name Continue`. The sheet then reads `What should we show you first?`. The groups are Price, Era, Case size, and Brand. There is no Dealer group. `click --name Skip` or `See watches` closes it and leaves Buy usable.
- **Phone questions.** A window under 900px, with `onboarded_at` still null, starts at `What should we call you?`. This keeper does not use that width.

## Gotchas

- `seed` finishes onboarding on purpose so Profile can be screenshotted. That precondition makes this journey fail if you reuse those accounts.
- A null birthday is allowed. The trigger rejects `onboarded_at` when `account_type` is missing, and when a birthday is present and under 18. Desktop finishes with a null birthday. A patched row that skips the phone wheels is not the phone path.
- Web copy on the alerts step says push is a mobile prompt. Continue still finishes the profile. The desktop sheet has no alerts step.
- A native build may show a paywall after the alerts step when RevenueCat is configured. Web does not. This harness does not open that paywall.
