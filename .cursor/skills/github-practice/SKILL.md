---
name: github-practice
description: >-
  Run Graham's GitHub loop from an updated main through a green squash merge.
  Use when committing, pushing, opening or merging a pull request, shipping
  or landing a change, or when the user mentions GitHub, drafts, CI, or main.
---

# GitHub practice

When the user asks for a change to the app, finish this loop through merge
once every gate passes. That is their standing authorization for this repo.

Stop early only when they name an earlier step, or a gate fails.

Never force-merge. Never bypass branch protection. Never skip git hooks.
Never merge a pull request this task did not open.

## Stop early

- "Commit" — commit on the branch. Do not push.
- "Push" or "open a draft" — open a draft pull request and leave it a draft.
- A question, a review, or "don't commit" — no git write and no GitHub write.

## Loop

1. Update `main`, then branch. One branch, one change. `feat/` for new
   behavior, `fix/` for a repair.

   ```bash
   git checkout main
   git pull
   git checkout -b feat/sold-badge
   ```

2. Make the change. Before every commit, run both checks. Both must pass.

   ```bash
   npm run typecheck
   npm run test:rls
   ```

   `npm run typecheck` catches type errors. It does not prove the app launches.
   `npm run test:rls` runs the database permission tests against the local
   database. A new schema change is a new file in `supabase/migrations`.
   Leave applied migrations untouched. A file in `supabase/migrations-pending`
   is not applied.

3. Commit in Conventional Commits, imperative present tense, under 72
   characters. The subject says why. Do not commit `.env` files or keys.

4. Push. The first push of a branch needs `-u`.

   ```bash
   git push -u origin HEAD
   ```

5. Open a draft pull request with the `AI` label. The title matches the
   commit subject. The body states the user-visible behavior in a few lines.
   If the `AI` label does not exist, create it and retry the create.

   ```bash
   gh pr create --draft --label AI --title "feat: show Sold in place of the price" --body "$(cat <<'EOF'
   ## Summary
   - A sold watch on the deck and the wishlist shows Sold instead of a price.

   ## Test plan
   - [ ] Deck card shows Sold
   - [ ] Wishlist card shows Sold

   EOF
   )"
   ```

6. Wait until all four CI jobs are green: `app`, `operator ui`,
   `edge functions`, `database`. Use `gh pr checks`. Pending is not green.

7. Mark it ready, squash-merge, and delete the remote branch.

   ```bash
   gh pr ready
   gh pr merge --squash --delete-branch
   ```

   Squash keeps `main` as a list of conventional commits. Use a merge commit
   only when the user asks to keep the branch's commits.

8. Update this laptop.

   ```bash
   git checkout main
   git pull
   git branch -d feat/sold-badge
   ```

## Gates that block the merge

Stop and name the failing gate. Leave the pull request a draft.

- `npm run typecheck` or `npm run test:rls` failed.
- Any of the four CI jobs is red or still running.
- The diff contains a secret.
- An already-applied file in `supabase/migrations` was edited.
- This task did not open the pull request.
- More than one pull request is open and the user did not name the number.
- The user named an earlier stop.

## Stale pull requests

An older open pull request is an older copy of the app. Close it once a newer
branch has replaced it. Merging it later puts that older copy back on `main`.

## Afterward

Tell the user the pull request URL and whether it merged. If a gate failed,
name the check and stop.
