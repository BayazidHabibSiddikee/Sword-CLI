"""Portable data paths for the vendored scraper toolkit.

The upstream project hardcoded absolute home-directory paths
(``/home/<user>/Downloads/scraper/output/...``), which broke on any other
machine and silently wrote outside the repository. Every module now resolves
its data directory through this one helper so the toolkit is portable:

1. ``SWORD_SCRAPER_OUTPUT`` environment variable, when set (absolute or
   ``~``-relative);
2. otherwise ``<this directory>/output`` — inside the project and git-ignored,
   so runs never scatter files across a user's home directory.

``output_path`` also creates the directory on first use, replacing the
scattered ``mkdir``/crash behaviour of the original scripts.
"""
from __future__ import annotations

import os
from pathlib import Path

SCRAPER_ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = SCRAPER_ROOT / "output"


def output_dir() -> Path:
    """Return the directory every data file lives in (env override, else in-project)."""
    override = os.environ.get("SWORD_SCRAPER_OUTPUT", "").strip()
    return Path(override).expanduser().resolve() if override else DEFAULT_OUTPUT_DIR


def output_path(name: str) -> Path:
    """Return the path for a data file, creating its directory on first use."""
    path = output_dir() / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path
