---
description: Drive a goal (or the next backlog task) through the design→dev→review→qa loop until it converges
argument-hint: [goal] — omit to pull the next unchecked task from the backlog
---
You are the **orchestrator**. Drive ONE goal through the subagent feedback loop
until it converges or hits the iteration cap, then STOP with a report. Subagents
are leaf workers and cannot call each other — YOU sequence them by delegating with
the Agent tool. The roster lives in `.claude/agents/` (see CLAUDE.md):
`designer` → `developer` → `reviewer` → `qa`.

MODE — decided by $ARGUMENTS:
- **Interactive** (`$ARGUMENTS` non-empty): the goal is $ARGUMENTS. Human is
  watching. No budget gate, no auto-commit, no notify — you leave the work for
  the human to review live and ship with /ship.
- **Unattended** (`$ARGUMENTS` empty): drive the next task from the backlog with
  the full autonomy envelope (budget gate, commit, backlog update, notify). This
  is the loop you run via `/loop /iterate` overnight.

Shared safety: never work on `main`; never open or merge a PR (the human ships
with /ship). Commit messages follow repo style — no emojis, no Co-Authored-By
trailer, no promotional links.

Unattended state + tools (used only in unattended mode):

    AGENT_STATE_DIR — the private state volume (NOT the repo). This is the single
      source of truth for the state location: the bin scripts read this env var,
      defaulting to ~/.claude/projects/-workspace/agent-state. Resolve it the same
      way — use $AGENT_STATE_DIR if it is set in the environment, otherwise that
      default path. It contains:
        backlog.md   the task checklist — you read AND update it
        budget.conf  the output-token cap
        notify.env   Discord webhook secret — never echo it
        refs/        reference images for task briefs
    python3 .claude/bin/budget-check.py {start|check|reset}
    .claude/bin/notify.sh "message"

Run this contract, in order:

1. BUDGET GATE *(unattended only)*. Run `python3 .claude/bin/budget-check.py
   check`. If `.stop` is true, run
       .claude/bin/notify.sh "🛑 iterate loop stopped: token budget reached (<spent>/<budget>)"
   and END THE LOOP — do not schedule another iteration. (Interactive mode skips
   this step entirely.)

2. PICK THE GOAL.
   - Interactive: the goal is $ARGUMENTS. Restate it in one line.
   - Unattended: read `$AGENT_STATE_DIR/backlog.md` and take the first unchecked
     `- [ ]` item. Treat EVERYTHING attached to it — indented prose, sub-bullets,
     and image references (`ref: refs/<img>` or any `refs/…` path) — as the brief.
     Resolve each image path relative to $AGENT_STATE_DIR and use the Read tool to
     VIEW it before building, so you design to the reference. If there are no unchecked
     items, run
         .claude/bin/notify.sh "✅ iterate loop stopped: backlog empty"
     and END THE LOOP.

3. BRANCH. Name the branch from the goal using repo conventions — `feat/<slug>`
   for new work, `fix/<slug>` for a bug, `chore/<slug>` for everything else
   (including design polish). If you are on `main`, create the branch from the
   latest `origin/main`. If you are already on a non-main working branch that
   suits the goal, stay on it. NEVER work on `main`.

4. SCOPE. Decide whether the goal involves visual/design or asset work
   (backgrounds, palette, type, layout aesthetics).

5. CONVERGE — the bounded dev loop, at most **3 dev rounds** (a round is one
   developer pass plus the review + qa gates after it):
   a. DESIGN (conditional). Only if step 4 found visual/asset work: delegate to
      the `designer` agent. It returns assets (SVG/CSS by default) + design notes.
      Carry those into the dev step. Skip for pure-logic tasks.
   b. IMPLEMENT. Delegate to the `developer` agent with the goal, any design
      notes/assets, and any findings from a previous round. It self-runs
      `npm run check` before returning.
   c. REVIEW. Delegate to the `reviewer` agent on the working diff. It returns
      findings + a `VERDICT:` line.
        - `changes-requested` → under the cap: return to (b) with the findings,
          increment the round. At the cap: stop converging, record the blocker.
        - `clean` → continue to (d).
   d. QA. Delegate to the `qa` agent. It runs `npm run check` + `npm run build`
      and verifies behavior, returning `PASS | FAIL` with evidence.
        - `FAIL` → under the cap: return to (b) with the failure evidence,
          increment the round. At the cap: stop converging, record the blocker.
        - `PASS` → CONVERGED.
   Keep the tree green. Each delegation starts with fresh context, so include the
   goal and the relevant prior findings in every prompt; pass only what the agent
   needs, not the whole transcript.

6. PERSIST — mode-aware.
   - Unattended: COMMIT to the branch with a concise message. Then UPDATE
     `$AGENT_STATE_DIR/backlog.md` — mark the item done (or note progress if it hit the cap
     unconverged) and add a one-line note on what you did and what is next, in the
     same predictable format as the rest of the file.
   - Interactive: leave the changes UNCOMMITTED for live review. Do not write to
     the backlog.

7. NOTIFY *(unattended only)*. Run
       .claude/bin/notify.sh "🔧 <task>: <one-line summary> (<branch>)"
   on success, or a clear blocker message if it hit the cap unconverged.
   (notify.sh silently no-ops if no webhook is configured.)

8. STOP this invocation and report concisely: the goal, what changed file by
   file, the review verdict, and qa's evidence. In interactive mode, note that
   the change is unshipped — the human reviews and runs /ship to open a PR. Under
   `/loop`, the loop continues with the next invocation and ends via the budget
   gate (step 1) or an empty backlog (step 2).

Safety: the guard hook blocks force-push / pushes to main / ruleset edits, and
the scoped token cannot reach other repos — so the worst case of an unattended
run is a throwaway working branch.
