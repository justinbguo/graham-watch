# Shipping a change

One change, on its own branch, reviewed as a pull request, then merged into
`main`. `main` is the app on GitHub. Start the next change from `main` after
you pull it. Do not keep old pull requests open "just in case." An old pull
request is an old copy of the app, and merging it later pastes that copy back.

## The sentence

Before you edit anything, write one sentence a buyer or a dealer would
recognize:

> A sold watch on the deck says Sold instead of a price.

That sentence is the branch, the commit, and the pull request. If the sentence
needs "and," it is two changes. Make the second one after the first is on
`main`.

## 1. Start clean

```bash
git status
```

The only line you want is `nothing to commit, working tree clean`. If Git lists
files, those edits are unsaved. Commit them, or throw them away on purpose,
before you switch branches. Otherwise Git stops you with:

> Your local changes to the following files would be overwritten by checkout

```bash
git checkout main
git pull
git checkout -b feat/sold-badge
```

`feat/` is a new behavior. `fix/` is a repair. The name is the sentence, in a
few words.

## 2. Make the change

Tell the AI the sentence, the screen, and anything that must stay the same.
"On the deck card, a sold watch says Sold in place of the price. The wishlist
uses the same card. Do not add a color."

Look at it:

```bash
npm run demo
```

That opens the app with the watches hardcoded in `src/lib/demo.ts`. Then:

```bash
npm run typecheck
```

Typecheck does not open the app. A screen can typecheck and still crash when
you launch it. What each check can see is in
[OPERATING](OPERATING.md#the-automated-checks).

A database change is a new file in `supabase/migrations`. A file left in
`supabase/migrations-pending` does not run.

## 3. Commit only this change

A commit is a checkpoint on this laptop. GitHub cannot see it yet.

```bash
git status
git add src/components/SwipeCard.tsx
git commit -m "feat: show Sold in place of the price"
```

`git add` chooses the files. `git commit` saves that choice. Add the files in
the sentence, not every file `git status` lists. Two messages you will hit:

- `no changes added to commit` means you skipped `git add`.
- `switch m requires a value` means `-m` was not followed by the message in
  quotes.

The message is present tense and says why: `feat: show Sold in place of the price`.

## 4. Push, then open a draft

A push copies commits to GitHub. The first push of a branch needs `-u`.

```bash
git push -u origin HEAD
gh pr create --draft --title "feat: show Sold in place of the price" --body "A sold watch on the deck and the wishlist shows Sold instead of a price."
```

A draft means you are still looking. Open it anyway so the checks run on
GitHub.

If GitHub says **There isn't anything to compare** and **main and your branch
are identical**, the push worked and the branch has no new commits. The edits
are still only on your laptop. Go back to step 3, then push again.

## 5. Read the checks, then merge

CI runs four jobs: `app`, `operator ui`, `edge functions`, and `database`.
A fifth workflow, `Deploy edge functions`, runs only after a push to `main`
that changes a function or `supabase/config.toml`. It does not run on a pull
request, and it does not apply migrations.
Vercel builds a preview of the web app. Open the preview and click the thing
you changed.

A red check is a failed command. Read the last error before you merge. This
repo does not block a merge on a red check, so a red check will not save you.

When the sentence is true on the preview and the checks you care about are
green, mark the pull request ready and merge that one.

```bash
git checkout main
git pull
git branch -d feat/sold-badge
```

The next change starts at step 1.

## When you stop

If you abandon a branch, close its pull request and delete the branch. Leaving
it open means the next merge might be the wrong one.

```bash
gh pr close 12 --comment "Superseded. Main has moved on."
git push origin --delete feat/sold-badge
```
