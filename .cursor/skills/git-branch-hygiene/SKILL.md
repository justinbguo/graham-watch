---
name: git-branch-hygiene
description: >-
  Diagnose and repair a messy Git branch without losing uncommitted work.
  Use when the user is on the wrong branch, a merged pull request was kept
  open, main moved ahead, a stash is in the way, the same change exists
  twice, or they ask to clean up Git or GitHub branches.
---

# Git branch hygiene

`main` is the shared line. A feature branch is one unmerged change. After its
pull request merges, that branch is leftover. The next change starts from an
updated `main`.

Read [docs/DEVELOPING.md](docs/DEVELOPING.md) and follow it. This skill is the
repair when that sequence was skipped.

## Safety

Do the read-only report first. Explain it in plain English before any command
that writes.

Never, unless the user names the exact branch, stash, or files and says to
destroy them:

- `git reset --hard`, `git clean`, `git checkout --`, `git restore` of a dirty
  file
- `git branch -D`, `git push --delete`, deleting a remote branch
- `git stash drop` before the stashed files are visible in the worktree and
  `npm run typecheck` passes
- `git push --force`, rebase, or amend of a pushed commit
- merging a pull request, or pushing, unless the user asked for that action

`git merge main` into the current feature branch is allowed after the user
agrees to the report. It does not delete their commits.

Uncommitted work is the fragile part. Commit it on the branch it belongs to,
or `git stash push -u`, before `git checkout`. A checkout that would overwrite
files must stop.

## Report

Run, from the repo root:

```bash
.cursor/skills/git-branch-hygiene/scripts/diagnose.sh
```

The script only reads. Then tell the user:

- which branch is checked out
- what is uncommitted
- what `main` has that this branch lacks
- what this branch has that `main` lacks
- which local branches are leftover
- which stashes exist

A branch is leftover when its commits are already on `main`, including the
same change under a different hash. The script flags that: a matching
patch-id, or a whole-branch diff that matches one squash commit on `main`.
Do not add commits to a leftover branch.

## Repair

1. If the checked-out branch is leftover and the worktree has edits, stash
   them (`git stash push -u -m "<what the edits are>"`) and check out a new
   branch from `main` (`feat/` or `fix/` plus the sentence). If an open
   feature branch already contains `main` and is the right home for those
   edits, check that branch out instead.
2. If the branch is the right one and `main` is ahead, `git merge main`.
   Do not rebase.
3. `git stash pop` only after the branch is the right one. On a conflict,
   keep `main`'s copy of a change that already merged, and keep the stash's
   copy of work that exists only in the stash. When one file has both, keep
   both hunks. `git stash drop` only after the files are in the worktree and
   typecheck passes.
4. A hand-copied fix that is already a commit on `main` is a second copy.
   Drop the uncommitted copy and take `main`'s. Do not cherry-pick it again.
5. Run `npm run typecheck`. Say what is still unverified.
6. Leave the result uncommitted unless the user asked for a commit. List the
   leftover branches and stashes. Ask before deleting any of them.

## What not to confuse

Merging `main` into a feature branch adds `main`'s commits beside the feature
commits. It does not replace the branch. Merging two feature branches into
each other, and skipping `main`, leaves the next branch cut from `main`
without the fix.

A shared repair (a rule for every screen) is its own `fix/` branch off
`main`, then a pull request. A change that only makes sense inside one
feature stays on that feature branch.
