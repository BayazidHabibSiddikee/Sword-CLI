#!/bin/bash
# MedEx scraper daemon — self-locating; no hardcoded user paths.
set -u
SCRAPER_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$SCRAPER_DIR/venv/bin/python" ]; then echo "scraper/venv not found — see INTEGRATION.md" >&2; exit 1; fi
LOGDIR="$SCRAPER_DIR/output"; mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/medex_daemon.log"
OUT="$(cd "$SCRAPER_DIR" && "$SCRAPER_DIR/venv/bin/python" -c 'from paths import output_dir; print(output_dir())')"
STATE_FILE="$OUT/checkpoint.json"

echo "[$(date)] Starting MedEx Scraper Daemon..." >> "$LOGFILE"

while true; do
  # Check if process already running
  if pgrep -f medex_async.py > /dev/null; then
    echo "[$(date)] Scraper running (PID: $(pgrep -f medex_async.py))" >> "$LOGFILE"
  else
    echo "[$(date)] Restarting scraper..." >> "$LOGFILE"
    cd "$SCRAPER_DIR"
    venv/bin/python medex_async.py >> "$LOGFILE" 2>&1 &
    sleep 5
  fi

  # Check completion
  if [ -f "$STATE_FILE" ]; then
    done=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(len(d.get('done',[])))" 2>/dev/null || echo "0")
    total=$(wc -l < "$OUT/brands.json" 2>/dev/null || echo "0")
    if [ "$done" -ge "$((total-5))" ]; then
      echo "[$(date)] COMPLETED! $done/$total brands scraped." >> "$LOGFILE"
      break
    fi
  fi

  # Sleep 10 minutes before next check
  sleep 600
done
