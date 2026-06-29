#!/usr/bin/env python3
"""Token-budget governor for the unattended iterate loop.

Consumption is summed from this machine's session transcripts (the same local
data /usage approximates) -- specifically output tokens, the controllable cost.
The subscription *limits* are not exposed to the sandbox, so the budget is an
absolute output-token cap calibrated to the user's relative target.

Subcommands:
  start   record current cumulative output tokens as the run baseline
  check   print JSON {spent, budget, remaining, stop} for tokens since baseline
  reset   clear the baseline (call when a run ends)

Budget is read from agent-state/budget.conf:
  NIGHTLY_OUTPUT_TOKEN_BUDGET=500000
"""
import glob
import json
import os
import sys

STATE_DIR = os.environ.get(
    "AGENT_STATE_DIR",
    os.path.expanduser("~/.claude/projects/-workspace/agent-state"),
)
PROJ_DIR = os.path.expanduser("~/.claude/projects/-workspace")
BASELINE = os.path.join(STATE_DIR, "run-baseline.txt")
BUDGET_CONF = os.path.join(STATE_DIR, "budget.conf")
DEFAULT_BUDGET = 500_000


def total_output_tokens() -> int:
    tot = 0
    for f in glob.glob(os.path.join(PROJ_DIR, "*.jsonl")):
        try:
            with open(f, errors="ignore") as fh:
                for line in fh:
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    u = (o.get("message") or {}).get("usage") or o.get("usage") or {}
                    tot += u.get("output_tokens", 0) or 0
        except FileNotFoundError:
            pass
    return tot


def read_budget() -> int:
    try:
        with open(BUDGET_CONF) as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("NIGHTLY_OUTPUT_TOKEN_BUDGET"):
                    return int(line.split("=", 1)[1].strip())
    except (FileNotFoundError, ValueError):
        pass
    return DEFAULT_BUDGET


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "start":
        os.makedirs(STATE_DIR, exist_ok=True)
        base = total_output_tokens()
        with open(BASELINE, "w") as fh:
            fh.write(str(base))
        print(json.dumps({"baseline": base}))
    elif cmd == "reset":
        try:
            os.remove(BASELINE)
        except FileNotFoundError:
            pass
        print(json.dumps({"reset": True}))
    else:  # check
        try:
            with open(BASELINE) as fh:
                base = int(fh.read() or 0)
        except (FileNotFoundError, ValueError):
            base = total_output_tokens()  # no baseline -> treat as spent 0
        budget = read_budget()
        spent = max(0, total_output_tokens() - base)
        remaining = budget - spent
        print(json.dumps({
            "spent": spent,
            "budget": budget,
            "remaining": remaining,
            "stop": remaining <= 0,
        }))


if __name__ == "__main__":
    main()
