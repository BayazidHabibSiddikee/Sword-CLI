#!/bin/bash
# MedEx status — self-locating; no hardcoded user paths.
SCRAPER_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$SCRAPER_DIR" && python3 -c 'from paths import output_dir; print(output_dir())' 2>/dev/null || echo "$SCRAPER_DIR/output")"
echo "=== MedEx Scraper Status (output: $OUT) ==="
if pgrep -f medex_persistent > /dev/null; then
    PID=$(pgrep -f medex_persistent)
    echo "✓ Running (PID: $PID)"
else
    echo "✗ Not running"
fi
python3 -c "import json; d=json.load(open('$OUT/brand_details.json')); print(f'Scraped: {len(d)} rows')" 2>/dev/null
echo ""
tail -3 "$SCRAPER_DIR/output/medex_persistent.log" 2>/dev/null | grep -v "WARNING\|INFO" | tail -1
