"""Keeps every file path the intake scripts are given inside the repo's workspace.

The web page's one-click start runs Claude Code with these scripts pre-approved, and that agent reads web
pages and owner uploads, so a prompt injection could hand a script any path: `render_brief.py -o` over
another script, `tavily_log.py --log ~/.zshrc`. Writes must land in gtm-workspace/; reads may also come
from fixtures/ (the demo). Symlinks are followed before the check.
"""
from __future__ import annotations

import os

# scripts/ → gtm-intake/ → skills/ → .claude/ → repo root. GTM_ROOT moves it (the tests use a temp folder);
# the launched agent can't set it, since its pre-approved commands must start with `python3`. It only
# inherits a GTM_ROOT the owner exported themselves, which moves the web app's workspace (ui.ts, workspace.ts) too.
REPO = os.environ.get("GTM_ROOT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..")


def _inside(path: str, folders: tuple[str, ...]) -> bool:
    real = os.path.realpath(path)
    roots = [os.path.realpath(os.path.join(REPO, d)) for d in folders]
    return any(real == r or real.startswith(r + os.sep) for r in roots)


def writable(path: str) -> str:
    """The path, if it's inside gtm-workspace/; otherwise stop the script (exit 1) without touching it."""
    if not _inside(path, ("gtm-workspace",)):
        raise SystemExit(f"ERROR won't write {path}: output goes inside gtm-workspace/<business>/. Nothing was written.")
    return path


def readable(path: str) -> str:
    """The path, if it's inside gtm-workspace/ or fixtures/; otherwise stop the script (exit 1)."""
    if not _inside(path, ("gtm-workspace", "fixtures")):
        raise SystemExit(f"ERROR won't read {path}: input comes from gtm-workspace/ or fixtures/. Nothing was written.")
    return path
