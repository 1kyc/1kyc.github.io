#!/usr/bin/env python3
"""PreToolUse guard for Bash. Blocks dangerous GitHub/git operations even in
bypass-permissions mode by emitting a "deny" PreToolUse decision.

Each rule is scoped to a single command SEGMENT -- the raw command is split on
shell separators (&& || ; | and newlines) before matching. This stops false
positives like `git push origin feat && gh pr create --base main`, where the
`--base main` (a PR target) previously tripped the push-to-main rule because
the whole command was scanned as one string.

Residual edge case (accepted): a quoted multi-line PR/commit body that itself
contains a line reading like a dangerous command would be split out and could
be blocked. This is defense-in-depth, not a hard boundary -- the real boundary
is a least-privilege gh token -- so rephrasing the body is an acceptable cost.
"""
import json
import re
import sys


def deny(reason: str) -> None:
    json.dump(
        {"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }},
        sys.stdout,
    )
    sys.exit(0)


def check_segment(seg: str) -> None:
    """Deny if this single command segment is dangerous."""
    def has(pattern: str) -> bool:
        return re.search(pattern, seg, re.IGNORECASE) is not None

    gh_write_api = has(r"\bgh\s+api\b") and has(
        r"(-X|--method)\s+(DELETE|PUT|PATCH|POST)"
    )

    # A. Ruleset / branch-protection / environment tampering via gh api writes.
    if gh_write_api and has(
        r"/(rulesets?|branches/[^/]+/protection|environments|deployment-branch-policies)([/?]|$|[^a-zA-Z])"
    ):
        deny("Blocked: modifying repo rulesets / branch protection / environments "
             "via gh api. If intended, do it manually outside the sandbox.")
    if has(r"\bgh\s+ruleset\s+(delete|edit)\b"):
        deny("Blocked: gh ruleset delete/edit.")

    # B/C. git push protections -- only within a `git push` segment.
    if has(r"\bgit\s+push\b"):
        # Hard force-push (allow the safer --force-with-lease).
        if has(r"--force($|[\s=])") or has(r"(^|\s)-f(\s|$)"):
            deny("Blocked: hard force-push. Use --force-with-lease to "
                 "force-update a feature branch.")
        # Plus-prefixed (force) refspec, e.g. git push origin +main.
        if has(r"\s\+[\w./-]+"):
            deny("Blocked: force refspec (+ref) push.")
        # Direct push to the protected branch (as a ref arg or :main target).
        if has(r"\s(origin\s+)?(main|master)(\s|$)") or has(r":(main|master)(\s|$)"):
            deny("Blocked: direct push to main/master. Open a PR instead.")

    # D. Repo deletion.
    if has(r"\bgh\s+repo\s+delete\b"):
        deny("Blocked: gh repo delete.")

    # E. Secret writes.
    if has(r"\bgh\s+secret\s+(set|delete|remove)\b"):
        deny("Blocked: gh secret write.")
    if gh_write_api and has(r"/secrets?([/?]|$|[^a-zA-Z])"):
        deny("Blocked: writing repo/org secrets via gh api.")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unparseable -> don't interfere

    cmd = (payload.get("tool_input") or {}).get("command") or ""
    if not cmd:
        sys.exit(0)

    # Fast path: only inspect commands that mention git/gh at all.
    if not re.search(r"(^|[^\w])(git|gh)([^\w]|$)", cmd, re.IGNORECASE):
        sys.exit(0)

    # Split the RAW command on shell separators (incl. newlines), then normalize
    # whitespace within each segment and check it independently.
    for raw in re.split(r"&&|\|\||[;|\n]", cmd):
        seg = re.sub(r"\s+", " ", raw).strip()
        if seg:
            check_segment(seg)

    sys.exit(0)


if __name__ == "__main__":
    main()
