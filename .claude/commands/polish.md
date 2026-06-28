---
description: One iteration of the unattended design-polish loop (run via /loop)
---
You are running ONE iteration of an unattended design-polish loop in bypass mode.
All coordination state lives in the agent-state volume, NOT in the repo:

    STATE = ~/.claude/projects/-workspace/agent-state
      backlog.md   the task checklist (you read AND update it)
      budget.conf  the nightly output-token cap
      *.env        secrets (Discord webhook) — never echo these

Tools you will use (committed in the repo):
    python3 .claude/bin/budget-check.py {start|check|reset}
    .claude/bin/notify.sh "message"

Iteration contract — do these in order, then stop:

1. BUDGET GATE. Run `python3 .claude/bin/budget-check.py check`. If `.stop` is
   true, run
       .claude/bin/notify.sh "🛑 polish loop stopped: token budget reached (<spent>/<budget>)"
   and END THE LOOP — do not schedule another iteration.

2. PICK A TASK. Read $STATE/backlog.md and take the first unchecked `- [ ]` item.
   If there are none, run
       .claude/bin/notify.sh "✅ polish loop stopped: backlog empty"
   and END THE LOOP.

3. BRANCH. Work on that task's `spike/<slug>` branch (create it from the latest
   `origin/main` if it does not exist). NEVER work on `main`. NEVER open or merge
   a PR — the human reviews live and ships with /ship.

4. ONE CHUNK. Do a single bounded chunk of polish on that task. Keep it green:
   `npm run check && npm run build`. If it breaks and you cannot fix it quickly,
   note the blocker in backlog.md and move on rather than thrashing.

5. COMMIT to the spike branch with a concise message (no emojis, no
   Co-Authored-By, no promo links).

6. UPDATE $STATE/backlog.md: mark progress, and add a one-line note on what you
   did and what is next for this task.

7. NOTIFY:
       .claude/bin/notify.sh "🔧 <task>: <one-line summary> (spike/<slug>)"

8. STOP this iteration. The loop will re-invoke you for the next one.

Safety: the guard hook blocks force-push / pushes to main / ruleset edits even
here, and the scoped token cannot reach other repos — so the worst case is a
throwaway spike branch.
