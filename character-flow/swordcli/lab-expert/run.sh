#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  LabGen – start backend (FastAPI) + frontend (Vite) together
#
#  Usage:
#    ./run.sh              – start both
#    ./run.sh --backend    – backend only
#    ./run.sh --frontend   – frontend only
#
#  Before first run set your LLM API key:
#    export LABGEN_LLM_KEY="sk-..."   (or edit labgen/settings.json)
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABGEN_DIR="$SCRIPT_DIR/labgen"
FRONTEND_DIR="$LABGEN_DIR/frontend"
BACKEND_DIR="$LABGEN_DIR/backend"
SETTINGS="$LABGEN_DIR/settings.json"

# ── colours ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[LabGen]${NC} $*"; }
ok()    { echo -e "${GREEN}[LabGen]${NC} $*"; }
warn()  { echo -e "${YELLOW}[LabGen]${NC} $*"; }
error() { echo -e "${RED}[LabGen]${NC} $*"; }

# ── parse args ───────────────────────────────────────────────────
RUN_BACKEND=true
RUN_FRONTEND=true
for arg in "$@"; do
  case "$arg" in
    --backend)  RUN_FRONTEND=false ;;
    --frontend) RUN_BACKEND=false  ;;
    --help|-h)
      echo "Usage: $0 [--backend|--frontend]"
      exit 0 ;;
  esac
done

# ── check required tools ─────────────────────────────────────────
info "Checking system dependencies..."
MISSING=()
for tool in python3 ngspice tectonic node npm; do
  if ! command -v "$tool" &>/dev/null; then
    MISSING+=("$tool")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  error "Missing required tools: ${MISSING[*]}"
  error "Install with: sudo apt-get install ${MISSING[*]}"
  exit 1
fi
ok "All system tools found."

# ── inject LLM API key if provided via env var ───────────────────
if [[ -n "${LABGEN_LLM_KEY:-}" ]]; then
  info "Injecting LABGEN_LLM_KEY into settings.json..."
  python3 - <<PYEOF
import json, os
path = "$SETTINGS"
with open(path) as f:
    s = json.load(f)
s["llm"]["api_key"] = os.environ["LABGEN_LLM_KEY"]
with open(path, "w") as f:
    json.dump(s, f, indent=2)
print("  API key updated.")
PYEOF
else
  # Warn if key is still placeholder
  CURRENT_KEY=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['llm']['api_key'])" 2>/dev/null || echo "")
  if [[ "$CURRENT_KEY" == "YOUR_API_KEY_HERE" || -z "$CURRENT_KEY" ]]; then
    warn "No LLM API key set. Report generation will fail."
    warn "  Set it: export LABGEN_LLM_KEY='sk-...' then re-run, or edit labgen/settings.json"
  fi
fi

# ── cleanup on exit ──────────────────────────────────────────────
PIDS=()
cleanup() {
  info "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  ok "Stopped."
}
trap cleanup INT TERM EXIT

# ── backend ──────────────────────────────────────────────────────
if $RUN_BACKEND; then
  info "Starting FastAPI backend on http://localhost:8000 ..."
  (
    cd "$LABGEN_DIR"
    python3 -m uvicorn backend.server:app \
      --host 0.0.0.0 \
      --port 8000 \
      --reload \
      --reload-dir pipeline \
      --reload-dir backend \
      --log-level info
  ) &
  PIDS+=($!)
  # Give backend a moment to start
  sleep 2
  if kill -0 "${PIDS[-1]}" 2>/dev/null; then
    ok "Backend started (PID ${PIDS[-1]})"
  else
    error "Backend failed to start. Check logs above."
    exit 1
  fi
fi

# ── frontend ─────────────────────────────────────────────────────
if $RUN_FRONTEND; then
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    info "node_modules not found — running npm install..."
    npm install --prefix "$FRONTEND_DIR"
  fi

  info "Starting Vite frontend on http://localhost:5173 ..."
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host 0.0.0.0
  ) &
  PIDS+=($!)
  sleep 2
  if kill -0 "${PIDS[-1]}" 2>/dev/null; then
    ok "Frontend started (PID ${PIDS[-1]})"
  else
    error "Frontend failed to start. Check logs above."
    exit 1
  fi
fi

# ── ready ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  LabGen is running!${NC}"
if $RUN_FRONTEND; then
  echo -e "  ${GREEN}Frontend:${NC}  http://localhost:5173"
fi
if $RUN_BACKEND; then
  echo -e "  ${GREEN}Backend:${NC}   http://localhost:8000"
  echo -e "  ${GREEN}API docs:${NC}  http://localhost:8000/docs"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

# Wait for all background processes
wait
