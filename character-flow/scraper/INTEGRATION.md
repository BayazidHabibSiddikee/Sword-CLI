# Vendored Web Scraper Toolkit (Camoufox)

This directory is a copy of the standalone `web-scraper` toolkit, vendored into
SwordCLI so the coding agent can fetch pages that plain HTTP cannot read
(JavaScript-rendered SPAs, WAF-protected targets).

## Provenance

- Source: the standalone `web-scraper` toolkit (no longer at any absolute path —
  this vendored copy under `scraper/` is canonical now).
- Copied: Python sources, shell helpers, config templates, docs, Makefile/Dockerfile.
- **Not** copied (deliberately): `venv/`, `.git/`, `__pycache__/`, `output/`,
  `examples/`, `docs/screenshots/`, and the credential-bearing
  `config/secrets.yaml` / `config/proxies.txt`. Recreate those locally if needed.

## Portable paths

The upstream scripts hardcoded `/home/<user>/Downloads/...` absolute paths, which
is why every data file now goes through `scraper/paths.py`:

- `paths.output_dir()` returns `SWORD_SCRAPER_OUTPUT` when set (absolute or
  `~`-relative), else `scraper/output/` inside the project (git-ignored).
- `paths.output_path(name)` additionally creates the directory on first use.
- All scraper entry points (`go.py`, `scraper.py`, `scraper_v2.py`,
  `fast_scraper.py`, `run_medex.py`, `medex_async.py`, `medex_brave.py`,
  `medex_persistent.py`, `medex_retry.py`), the Makefile and the shell helpers
  resolve through it, so a run never writes outside the project.

## How SwordCLI uses it

| Tool            | Transport                              | When                                        |
| --------------- | -------------------------------------- | ------------------------------------------- |
| `fetch_web`     | Node `fetch` + HTML→Markdown           | Default. Fast, no browser, no Python.       |
| `fetch_web_rendered` | `python3 scraper/render_page.py URL` (Camoufox) | Opt-in. JS-heavy or bot-protected pages. |

`render_page.py` is the only file added by SwordCLI: it renders one URL with
Camoufox, converts the DOM to Markdown, and prints one JSON object on stdout.

## Runtime requirements

The Node side probes for an interpreter in this order:

1. `SWORD_BROWSER_PYTHON` (absolute path to a Python with `camoufox` installed)
2. `scraper/venv/bin/python` (if you create a venv here)
3. `python3` on `PATH`

Set up a venv inside this directory:

```bash
cd scraper
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/camoufox fetch          # one-time browser download (~/.cache/camoufox)
venv/bin/python render_page.py https://example.com
```

If no interpreter has Camoufox, `fetch_web_rendered` returns a clear error and
the agent should fall back to `fetch_web`.