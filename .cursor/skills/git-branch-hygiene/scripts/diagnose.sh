#!/usr/bin/env bash
# Read-only picture of this repo's branches against main.
# Prints facts. Does not checkout, merge, stash, or delete.
set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "not a git repo" >&2
  exit 1
fi

root=$(git rev-parse --show-toplevel)
cd "$root"

if ! git rev-parse --verify --quiet main >/dev/null; then
  echo "no local main branch" >&2
  exit 1
fi

current=$(git branch --show-current)
if [ -z "$current" ]; then
  current="(detached $(git rev-parse --short HEAD))"
fi

echo "== checked out =="
echo "$current"
git status -sb
echo

echo "== this branch has, main does not =="
if [ "$current" = "main" ]; then
  echo "(on main)"
else
  git log --oneline main..HEAD || true
fi
echo

echo "== main has, this branch does not =="
if [ "$current" = "main" ]; then
  echo "(on main)"
else
  git log --oneline HEAD..main || true
fi
echo

echo "== local branches already contained in main =="
git branch --merged main | sed 's/^[* ] //' | grep -v '^main$' || true
echo

echo "== each local branch against main =="
# A squash-merged pull request is not "contained": the branch tip is a
# different hash from the commit on main. Count commits, then match patches.
# Squash merges append " (#12)" to the subject. Strip that before comparing.
strip_pr() { printf '%s\n' "$1" | sed -E 's/ \(#[0-9]+\)$//'; }
subjects=$(git log --format='%s' main -n 80 | while read -r line; do strip_pr "$line"; done)
found=0
while read -r branch; do
  [ "$branch" = "main" ] && continue
  counts=$(git rev-list --left-right --count "main...$branch")
  behind=$(echo "$counts" | awk '{print $1}')
  ahead=$(echo "$counts" | awk '{print $2}')
  echo "$branch  main has $behind not on it, it has $ahead not on main"
  branch_found=0
  while read -r sha; do
    [ -z "$sha" ] && continue
    subject=$(strip_pr "$(git log -1 --format='%s' "$sha")")
    echo "$subjects" | grep -Fxq "$subject" || continue
    local_id=$(git show --format= "$sha" | git patch-id --stable | awk '{print $1}')
    match=$(git log main --format='%H' --grep="$subject" --fixed-strings -n 20 || true)
    while read -r other; do
      [ -z "$other" ] && continue
      [ "$other" = "$sha" ] && continue
      other_subject=$(strip_pr "$(git log -1 --format='%s' "$other")")
      [ "$other_subject" = "$subject" ] || continue
      other_id=$(git show --format= "$other" | git patch-id --stable | awk '{print $1}')
      if [ -n "$local_id" ] && [ "$local_id" = "$other_id" ]; then
        echo "  leftover  $(git rev-parse --short "$sha") == $(git rev-parse --short "$other")  $subject"
        found=1
        branch_found=1
      fi
    done <<< "$match"
  done < <(git rev-list --max-count=15 "$branch" --not main 2>/dev/null || true)
  # A squash of several commits matches none of them one by one. Compare the
  # whole branch diff with each commit main has that this branch lacks.
  if [ "$branch_found" -eq 0 ] && [ "$ahead" -gt 0 ]; then
    base=$(git merge-base main "$branch")
    range_id=$(git diff "$base" "$branch" | git patch-id --stable | awk '{print $1}')
    if [ -n "$range_id" ]; then
      while read -r other; do
        [ -z "$other" ] && continue
        other_id=$(git show --format= "$other" | git patch-id --stable | awk '{print $1}')
        if [ "$range_id" = "$other_id" ]; then
          echo "  leftover  $(git rev-parse --short "$branch") == $(git rev-parse --short "$other")  $(strip_pr "$(git log -1 --format='%s' "$other")")"
          found=1
          break
        fi
      done < <(git rev-list --max-count=20 main --not "$branch" --no-merges 2>/dev/null || true)
    fi
  fi
done < <(git for-each-ref --format='%(refname:short)' refs/heads/)
if [ "$found" -eq 0 ]; then
  echo "(no duplicate patches)"
fi
echo

echo "== stashes =="
git stash list || true
