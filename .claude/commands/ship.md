---
description: Run checks, then open a PR from the current branch (never pushes main)
argument-hint: [optional PR title / notes]
---
Ship the current branch as a pull request. This is the human-invoked "I reviewed
it live and want to keep it" command — the autonomous loop never calls it.

Steps:
1. If the current branch is `main` or `master`, STOP and tell the user to switch
   to a `feat/…`, `fix/…`, or `spike/…` branch first.
2. Run `npm run check` and `npm run build`. If either fails, STOP and show the
   output — do not commit or push.
3. Commit any uncommitted work with a concise message (no emojis, no
   Co-Authored-By trailer, no promotional links).
4. Push the branch and open a PR against `main` via `gh pr create`, with a body
   summarizing what changed and why.
5. Print the PR URL. Do NOT merge — the user merges.

If $ARGUMENTS is non-empty, use it as the PR title / extra notes.
