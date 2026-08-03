#!/usr/bin/env python3
"""PostToolUse hook for SendUserFile. Makes delivered files openable locally.

The problem: SendUserFile paths usually live in the session scratchpad under
/tmp/claude-*/, which is OUTSIDE the /workspace bind mount. The VS Code
Explorer is rooted at the workspace, so it can never show those files -- they
arrive fine on the Claude Code mobile app but are invisible in the editor.

This hook mirrors every delivered file into <project>/.preview/ (gitignored),
and additionally opens images as editor tabs via the dev container's remote
`code` CLI. Two paths on purpose: the `code` route is the nice one (the tab
just appears), but it depends on VSCODE_IPC_HOOK_CLI pointing at a LIVE window,
which goes stale after a window reload or when Claude Code is started outside
the VS Code terminal. The .preview/ copy always works, so a stale socket
degrades to "one click in the Explorer" instead of back to square one.

Copies keep their original basename, so re-sending sheet.png overwrites the
same file and any already-open tab live-updates rather than piling up tabs.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# Opened as editor tabs. Everything else is copied but not opened, so a
# delivered .zip or .csv is findable without spawning a useless tab.
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif", ".ico"}

PREVIEW_DIRNAME = ".preview"
KEEP = 40          # most recent files retained in .preview/
CODE_TIMEOUT = 8   # seconds; a stale IPC socket must not hang the turn


def project_dir() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or "/workspace")


def find_code() -> str | None:
    """Locate the remote `code` CLI. PATH first, then the known server layouts.

    Several VS Code server versions can be installed side by side, so the
    fallback takes the most recently written one. glob() on a missing directory
    yields nothing rather than raising, so the roots need no existence guard.
    """
    found = shutil.which("code")
    if found:
        return found
    roots = ("/vscode/vscode-server/bin", str(Path.home() / ".vscode-server/bin"))
    # The system-wide layout nests one level deeper (arch dir) than the user one.
    patterns = ("*/bin/remote-cli/code", "*/*/bin/remote-cli/code")
    matches = [p for root in roots for pat in patterns for p in Path(root).glob(pat)]
    if not matches:
        return None
    return str(max(matches, key=lambda p: p.stat().st_mtime))


def prune(preview: Path) -> None:
    files = sorted((p for p in preview.iterdir() if p.is_file()),
                   key=lambda p: p.stat().st_mtime, reverse=True)
    for stale in files[KEEP:]:
        try:
            stale.unlink()
        except OSError:
            pass


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # unparseable -> don't interfere

    files = (payload.get("tool_input") or {}).get("files") or []
    if not isinstance(files, list) or not files:
        sys.exit(0)

    root = project_dir()
    preview = root / PREVIEW_DIRNAME
    opened, mirrored = [], []

    for entry in files:
        if not isinstance(entry, str):
            continue
        src = Path(entry)
        if not src.is_absolute():
            src = Path.cwd() / src
        try:
            if not src.is_file():
                continue
        except OSError:
            continue

        # Already inside the workspace? The Explorer can reach it; just open it.
        if src.is_relative_to(root):
            target = src
        else:
            try:
                preview.mkdir(parents=True, exist_ok=True)
                target = preview / src.name
                shutil.copy2(src, target)
                mirrored.append(target)
            except OSError:
                continue

        if target.suffix.lower() in IMAGE_SUFFIXES:
            opened.append(target)

    if mirrored:
        try:
            prune(preview)
        except OSError:
            pass

    # Env check first: it is free, and without a live socket the CLI lookup is
    # wasted work. One spawn for all of them (the CLI takes many paths), which
    # keeps a wedged socket to a single CODE_TIMEOUT instead of one per file.
    if opened and os.environ.get("VSCODE_IPC_HOOK_CLI"):
        code = find_code()
        if code:
            try:
                subprocess.run([code, "-r", *(str(p) for p in opened)],
                               timeout=CODE_TIMEOUT, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, check=False)
            except (subprocess.TimeoutExpired, OSError):
                pass  # socket is wedged; the .preview/ copies still stand in

    # Report the copies when there are any, else the files merely opened. Saying
    # "mirrored" about a file that already lived in the workspace would be a lie.
    shown = mirrored or opened
    if shown:
        names = ", ".join(p.name for p in shown[:3])
        extra = f" (+{len(shown) - 3} more)" if len(shown) > 3 else ""
        verb = f"Mirrored to {PREVIEW_DIRNAME}/" if mirrored else "Opened"
        json.dump({"systemMessage": f"{verb}: {names}{extra}",
                   "suppressOutput": True}, sys.stdout)

    sys.exit(0)


if __name__ == "__main__":
    main()
