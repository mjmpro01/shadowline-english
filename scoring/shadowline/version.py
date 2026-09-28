"""Which code this process is running.

Shown in the console beside the API's and the console's own, so a worker left
running from before a pull is visible rather than a mystery. The same rule as
the server (internal/version) and the console (vite.config.ts), so the three
compare:

1. SHADOWLINE_VERSION, when the deployment sets it (the Docker images do);
2. the git commit of the checkout this code runs from, seven characters, with
   "-dirty" when tracked files have changes;
3. "unknown".
"""

from __future__ import annotations

import functools
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _git(*args: str) -> str:
    done = subprocess.run(
        ["git", "-C", str(HERE), *args],
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    )
    return done.stdout.strip()


@functools.cache
def current() -> str:
    pinned = os.environ.get("SHADOWLINE_VERSION", "").strip()
    if pinned:
        return pinned
    try:
        commit = _git("rev-parse", "--short=7", "HEAD")
        dirty = _git("status", "--porcelain", "--untracked-files=no")
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return f"{commit}-dirty" if dirty else commit
