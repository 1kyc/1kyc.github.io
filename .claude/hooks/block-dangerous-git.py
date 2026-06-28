#!/usr/bin/env python3
"""PreToolUse guard for Bash. Blocks dangerous GitHub/git operations even in
bypass-permissions mode by emitting a "deny" PreToolUse decision.

Defense-in-depth only -- the real boundary is a least-privilege gh token.
Reads the hook payload (JSON) on stdin; allows by exiting 0 with no output.
"""
import json
import re
import sys


def deny(reason: str) -> None:
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
    )
    sys.exit(0)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unparseable -> don't interfere

    cmd = (payload.get("tool_input") or {}).get("command") or ""
    if not cmd:
        sys.exit(0)

    # Collapse whitespace so multi-line commands match on one line.
    c = re.sub(r"\s+", " ", cmd)

    # Fast path: only inspect git/gh commands.
    if not re.search(r"(^|[^\w])(git|gh)([^\w]|$)", c):
        sys.exit(0)

    def has(pattern: str) -> bool:
        return re.search(pattern, c, re.IGNORECASE) is not None

    gh_write_api = has(r"\bgh\s+api\b") and has(r"(-X|--method)\s+(DELETE|PUT|PATCH|POST)")

    # A. Ruleset / branch-protection / environment tampering via gh api writes.
    if gh_write_api and has(
        r"/(rulesets?|branches/[^/]+/protection|environments|deployment-branch-policies)([/?]|$|[^a-zA-Z])"
    ):
        deny("Blocked: modifying repo rulesets / branch protection / environments "
             "via gh api. If intended, do it manually outside the sandbox.")
    if has(r"\bgh\s+ruleset\s+(delete|edit)\b"):
        deny("Blocked: gh ruleset delete/edit.")

    # B/C. git push protections.
    if has(r"\bgit\s+push\b"):
        # Hard force-push (allow the safer --force-with-lease).
        if has(r"--force($|[\s=])") or has(r"(^|\s)-f(\s|$)"):
            deny("Blocked: hard force-push. Use --force-with-lease to "
                 "force-update a feature branch.")
        # Plus-prefixed (force) refspec, e.g. git push origin +main.
        if has(r"push[^|]*\s\+[\w./-]+"):
            deny("Blocked: force refspec (+ref) push.")
        # Direct push to the protected branch.
        if has(r"push[^|]*\s(origin\s+)?(main|master)(\s|$)") or has(
            r"push[^|]*:(main|master)(\s|$)"
        ):
            deny("Blocked: direct push to main/master. Open a PR instead.")

    # D. Repo deletion.
    if has(r"\bgh\s+repo\s+delete\b"):
        deny("Blocked: gh repo delete.")

    # E. Secret writes.
    if has(r"\bgh\s+secret\s+(set|delete|remove)\b"):
        deny("Blocked: gh secret write.")
    if gh_write_api and has(r"/secrets?([/?]|$|[^a-zA-Z])"):
        deny("Blocked: writing repo/org secrets via gh api.")

    sys.exit(0)


if __name__ == "__main__":
    main()
