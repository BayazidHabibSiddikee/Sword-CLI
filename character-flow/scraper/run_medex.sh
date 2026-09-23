#!/bin/bash
# Long-running MedEx daemon. All data paths resolve through scraper/paths.py
# (SWORD_SCRAPER_OUTPUT env var, defaulting to scraper/output/ inside the project).
cd "$(dirname "$0")"
if [ ! -x venv/bin/python ]; then echo "scraper/venv not found — see INTEGRATION.md" >&2; exit 1; fi
OUT="$(SWORD_SCRAPER_OUTPUT="${SWORD_SCRAPER_OUTPUT:-}" venv/bin/python -c 'from paths import output_dir; print(output_dir())')"
LOGDIR="$(pwd)/output"; mkdir -p "$LOGDIR"
echo "Launching medex fill ($(wc -l < "$OUT/brands.json" 2>/dev/null || echo 0) brands total; output dir: $OUT)..."
nohup venv/bin/python medex_scraper.py details --delay 1.0 --no-proxy \
  --brands-file "$OUT/brands.json" \
  --details-file "$OUT/brand_details.json" \
  --failed-file "$OUT/brand_details_failed.json" \
  > "$LOGDIR/medex_full_run.log" 2>&1 &
echo "PID=$!  tail -f $LOGDIR/medex_full_run.log"
