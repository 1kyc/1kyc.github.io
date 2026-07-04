---
description: Prune stale branches, switch to main, and fast-forward pull — clean slate for a new feature
argument-hint: [optional new branch name, e.g. feat/thing]
---
Bring the local repo to a clean, up-to-date `main` so a new feature can start
from a fresh base. This is the human-invoked "reset me to main" command.

Steps:
1. If the working tree has uncommitted changes (`git status --porcelain` is
   non-empty), STOP and show them. Do NOT stash, discard, or switch branches —
   let the user commit or stash first. This command must never lose work.
2. `git fetch --prune origin` — update remote-tracking refs and drop refs whose
   remote branch was deleted (i.e. merged PRs).
3. Switch to `main` (`git checkout main`).
4. Fast-forward only: `git merge --ff-only origin/main`. If it can't
   fast-forward (local `main` has diverging commits), STOP and report it rather
   than creating a merge commit — the user decides how to reconcile.
5. Report local branches whose upstream is now gone (merged), so the user can
   clean them up: `git branch -vv | grep ': gone]'`. List them but do NOT delete
   anything — deletion is a separate, deliberate act.
6. If $ARGUMENTS is non-empty, treat it as a new branch name and create + switch
   to it from the freshly-updated `main` (`git checkout -b $ARGUMENTS`). Prefer a
   `feat/…`, `fix/…`, `chore/…`, or `spike/…` prefix per the repo's workflow
   rules; if the name lacks one, ask before creating.

Finish by printing the current branch and a one-line status (e.g. "on main, up
to date with origin/main" or "on feat/x, branched from main@<sha>").
