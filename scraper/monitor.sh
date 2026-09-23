#!/bin/bash
# MedEx monitor — self-locating; no hardcoded user paths.
SCRAPER_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$SCRAPER_DIR" && python3 -c 'from paths import output_dir; print(output_dir())' 2>/dev/null || echo "$SCRAPER_DIR/output")"
while true; do
  rows=$(python3 -c "import json; print(len(json.load(open('$OUT/brand_details.json'))))" 2>/dev/null || echo "?")
  pid=$(pgrep -f medex_async.py | head -1)
  if [ -z "$pid" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] PROCESS ENDED - Rows: $rows"
    exit 0
  fi
  echo "[$(date '+%H:%M:%S')] Rows: $rows | PID: $pid"
  sleep 300  # Check every 5 minutes
done
