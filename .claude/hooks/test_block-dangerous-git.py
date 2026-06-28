#!/usr/bin/env python3
"""Regression suite for block-dangerous-git.py.

Cases live in this file (not on a command line) so the dangerous strings never
trip the guard hook itself. Run:  python3 .claude/hooks/test_block-dangerous-git.py
"""
import json
import os
import subprocess

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "block-dangerous-git.py")

# (expect, command)
CASES = [
    # --- BLOCK: admin / destructive ---
    ("block", "gh api --method DELETE repos/o/r/rulesets/123"),
    ("block", "gh api -X PUT repos/o/r/branches/main/protection"),
    ("block", "git push --force origin feat/x"),
    ("block", "git push -f origin feat/x"),
    ("block", "git push origin main"),
    ("block", "git push -u origin main"),
    ("block", "git push origin HEAD:main"),
    ("block", "git push origin +main"),
    ("block", "gh repo delete o/r --yes"),
    ("block", "gh secret set FOO --body bar"),
    ("block", "gh api -X POST repos/o/r/environments/github-pages/deployment-branch-policies -f name=x"),
    # --- ALLOW: routine ---
    ("allow", "git push -u origin feat/some-branch"),
    ("allow", "git push --force-with-lease origin feat/x"),
    ("allow", 'git commit -m "fix main bug"'),
    ("allow", "gh pr create --base main --title x --body y"),
    ("allow", "gh api repos/o/r/rulesets"),
    ("allow", "git push origin feat/mainline-thing"),
    ("allow", "npm run build"),
    ("allow", "ls -la"),
    # --- compound commands (segment scoping) ---
    ("allow", "git push -q origin chore/x && gh pr create --base main --head chore/x"),
    ("allow", "git push -q origin feat/y\ngh pr create --base main --head feat/y"),
    ("allow", "git add . && git commit -m msg && git push origin feat/z && gh pr create --base main"),
    ("block", "git push -u origin main && echo done"),
    ("block", "gh api repos/o/r -q .x && gh api -X DELETE repos/o/r/rulesets/1"),
    ("block", "git push origin feat/a | tee log && git push --force origin feat/b"),
]


def run(cmd: str) -> str:
    payload = json.dumps({"tool_input": {"command": cmd}})
    out = subprocess.run(["python3", HOOK], input=payload,
                         capture_output=True, text=True).stdout
    return "block" if out.strip() else "allow"


def main() -> int:
    p = f = 0
    for expect, cmd in CASES:
        got = run(cmd)
        ok = got == expect
        p += ok
        f += not ok
        print(f"{'OK  ' if ok else 'FAIL'} exp={expect:5} got={got:5} | {cmd!r}")
    print(f"\n==== pass={p} fail={f} ====")
    return 1 if f else 0


if __name__ == "__main__":
    raise SystemExit(main())
