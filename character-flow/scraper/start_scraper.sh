#!/bin/bash
# Restart loop for go.py — self-locating; no hardcoded user paths.
set -u
SCRAPER_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$SCRAPER_DIR/venv/bin/python" ]; then echo "scraper/venv not found — see INTEGRATION.md" >&2; exit 1; fi
cd "$SCRAPER_DIR"
while true; do
    echo "[$(date)] Starting scraper..."
    venv/bin/python go.py
    EXIT_CODE=$?
    echo "[$(date)] Scraper exited with code $EXIT_CODE"
    echo "[$(date)] Restarting in 30 seconds..."
    sleep 30
done
