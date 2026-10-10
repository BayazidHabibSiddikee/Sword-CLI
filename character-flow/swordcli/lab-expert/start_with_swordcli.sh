#!/usr/bin/env bash
set -e

SWORDCLI_DIR="/home/sword/Documents/Characters/character-flow/swordcli/server"
LABGEN_DIR="$(pwd)"

echo "Updating LAB_Expert settings to point to SwordCLI..."
python3 - <<PYEOF
import json, os
path = "labgen/settings.json"
if os.path.exists(path):
    with open(path) as f:
        s = json.load(f)
    s["llm"]["provider"] = "openai"
    s["llm"]["base_url"] = "http://127.0.0.1:3001/v1"
    s["llm"]["api_key"] = "swordcli-labexpert"
    with open(path, "w") as f:
        json.dump(s, f, indent=2)
PYEOF

echo "Checking SwordCLI dependencies..."
cd "$SWORDCLI_DIR"
if [ ! -d "node_modules" ]; then
    npm install
fi

echo "Starting SwordCLI backend proxy..."
npm run dev &
SWORD_PID=$!

cd "$LABGEN_DIR"
echo "Starting LAB_Expert..."
./run.sh &
LAB_PID=$!

trap "kill -9 $SWORD_PID $LAB_PID" EXIT
wait
