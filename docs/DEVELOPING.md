# Making a change

How a feature gets from an idea onto `main`. Setup and day-to-day commands live
in the [README](../README.md) and [OPERATING](OPERATING.md). This is the loop
around them.

`main` is the app as it exists on GitHub. A branch is a copy of `main` where
the work happens. A commit is a saved checkpoint on that branch. A pull request
is the request to copy that branch back onto `main`. GitHub cannot see a file
until it is committed and pushed.

## 1. Start from GitHub's main

The `main` on this laptop can drift from GitHub. Update it before you branch.

```bash
git checkout main
git pull
git checkout -b feat/sold-badge
```

`feat/sold-badge` is the branch name. `feat/` means a new behavior. `fix/`
means a repair. One branch, one change. The example through this guide is a
sold watch on the deck showing the word Sold in place of the price.

## 2. Say what the user should see

Describe the behavior and the screen. "On the deck card, a sold watch says
Sold in place of the price. The wishlist uses the same card."

Leave the file names and the approach to the AI. If you already know a
constraint, say it: "Do not add a new color. Use the tokens already in the
design file."

Look at the result before you accept it.

```bash
npm run demo
```

That starts Graham with the watches hardcoded in `src/lib/demo.ts`, so you can
see the card without a database. `npm run typecheck` checks that the types
still line up. Typecheck does not open the app. A screen can typecheck and
still crash on launch, which is why you look at it.

Run `npm run typecheck` and `npm run test:rls` before every commit. What each
check can and cannot see is in [OPERATING](OPERATING.md#the-automated-checks).

A database change is a new file in `supabase/migrations`. A file in
`supabase/migrations-pending` is not applied. Editing a migration that has
already run makes two machines disagree about the schema.

## 3. Commit, then push

A commit stays on this laptop. A push copies the commits to GitHub.

Ask for a commit once the card looks right. The message says why, in the
present tense: `feat: show Sold in place of the price`.

```bash
git push -u origin HEAD
```

The first push of a branch needs `-u`. Later pushes of that same branch are
`git push`.

## 4. Open a draft pull request

A draft means you are still looking. Open it so the checks run on GitHub, not
only on your laptop.

```bash
gh pr create --draft --title "feat: show Sold in place of the price" --body "A sold watch on the deck and the wishlist shows Sold instead of a price."
```

CI runs four jobs on every pull request: `app` (typecheck and a web bundle),
`operator ui`, `edge functions`, and `database`. A red job is a failed check.
Read which job failed before you merge. This repo does not block a merge on a
red check, so the check is information, not a lock.

Vercel builds a preview of the web app for the pull request. Open that link
and click the card there too.

## 5. Merge, then update this laptop

When the card is right and the checks you care about are green, mark the pull
request ready and merge that one into `main`.

```bash
git checkout main
git pull
git branch -d feat/sold-badge
```

The next feature starts again at step 1. The old branch is done.

## What to ask for

- The user-visible change, the screen, and any product rule.
- "Commit" when you want a checkpoint. "Push" and "open a draft pull request"
  when you want it on GitHub. "Merge pull request N" when you want it on
  `main`. Name the number when more than one is open.

## Two traps

A file you can see in the editor is not on GitHub until it is committed and
pushed. Asking to merge before that ships the older copy.

An older open pull request is an older copy of the app. Close it once a newer
branch has replaced it. Merging it later pastes that older copy back onto
`main`.
