#!/bin/bash
# FreeLLMAPI + AI Debate - Unified Startup Script
# Usage: ./run.sh [start|stop|restart|status]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBATE_DIR="$HOME/Documents/AI_Debate"
LOG_DIR="$SCRIPT_DIR/logs"
PID_DIR="$SCRIPT_DIR/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

start_freellmapi() {
    if lsof -i :3001 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Express Server (:3001) already running${NC}"
        return 0
    fi
    echo "Starting FreeLLMAPI Express Server..."
    cd "$SCRIPT_DIR"
    nohup npx tsx server/src/index.ts > "$LOG_DIR/freellmapi.log" 2>&1 &
    echo $! > "$PID_DIR/freellmapi.pid"
    for i in {1..10}; do
        if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Express Server running on :3001${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ Failed to start Express Server${NC}"
    return 1
}

start_vite() {
    # Vite is optional - Express serves everything on :3001
    if lsof -i :5174 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Vite Dashboard (:5174) already running${NC}"
        return 0
    fi
    echo "Starting Vite Dashboard (optional - Express also works on :3001)..."
    cd "$SCRIPT_DIR"
    nohup npx vite --config client/vite.config.ts --port 5174 --host 0.0.0.0 > "$LOG_DIR/vite.log" 2>&1 &
    echo $! > "$PID_DIR/vite.pid"
    sleep 3
    if curl -s http://localhost:5174/ >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Vite Dashboard running on :5174${NC}"
    else
        echo -e "${YELLOW}⚠ Vite may still be starting... Use :3001 instead${NC}"
    fi
}

start_debate() {
    if lsof -i :5050 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Python Debate Server (:5050) already running${NC}"
        return 0
    fi
    echo "Starting Python Debate Server..."
    cd "$DEBATE_DIR"
    if [ ! -f "venv/bin/python" ]; then
        echo "  Creating Python virtual environment..."
        python3 -m venv venv
        source venv/bin/activate
        pip install -q -r requirements-debate.txt
        pip install -q -r requirements-rag.txt
    fi
    source venv/bin/activate
    nohup python app.py > "$LOG_DIR/debate.log" 2>&1 &
    echo $! > "$PID_DIR/debate.pid"
    for i in {1..10}; do
        if curl -s http://localhost:5050/ >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Python Debate Server running on :5050${NC}"
            return 0
        fi
        sleep 1
    done
    echo -e "${RED}✗ Failed to start Python Debate Server${NC}"
    return 1
}

stop_all() {
    echo "Stopping all services..."
    [ -f "$PID_DIR/freellmapi.pid" ] && kill $(cat "$PID_DIR/freellmapi.pid") 2>/dev/null || true
    pkill -f "tsx.*server/src" 2>/dev/null || true
    [ -f "$PID_DIR/vite.pid" ] && kill $(cat "$PID_DIR/vite.pid") 2>/dev/null || true
    pkill -f "vite.*client" 2>/dev/null || true
    [ -f "$PID_DIR/debate.pid" ] && kill $(cat "$PID_DIR/debate.pid") 2>/dev/null || true
    pkill -f "python app.py" 2>/dev/null || true
    echo -e "${GREEN}✓ All services stopped${NC}"
}

show_status() {
    echo ""
    echo "=========================================="
    echo "     FreeLLMAPI Status"
    echo "=========================================="
    echo ""
    
    if curl -s http://localhost:3001/api/health >/dev/null 2>&1; then
        chars=$(curl -s http://localhost:3001/api/characters | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
        echo -e "${GREEN}✓${NC} Express Server (:3001) - RUNNING"
        echo "    Dashboard: http://localhost:3001/"
        echo "    Playground: http://localhost:3001/playground"
        echo "    Debate UI: http://localhost:3001/debate"
        echo "    Characters: $chars loaded"
    else
        echo -e "${RED}✗${NC} Express Server (:3001) - DOWN"
    fi
    
    echo ""
    
    if curl -s http://localhost:5174/ >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Vite Dashboard (:5174) - RUNNING (optional)"
        echo "    http://localhost:5174/"
    else
        echo -e "${YELLOW}⚠${NC} Vite Dashboard (:5174) - NOT RUNNING"
        echo "    (Use http://localhost:3001/ instead - it works!)"
    fi
    
    echo ""
    
    if curl -s http://localhost:5050/ >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Python Debate Server (:5050) - RUNNING"
        echo "    API: http://localhost:5050/"
    else
        echo -e "${RED}✗${NC} Python Debate Server (:5050) - DOWN"
    fi
    
    echo ""
    echo "=========================================="
    echo "  Quick Commands:"
    echo "    ./run.sh start    - Start all services"
    echo "    ./run.sh stop     - Stop all services"
    echo "    ./run.sh restart  - Restart all services"
    echo "    ./run.sh status   - Show status"
    echo "=========================================="
    echo ""
}

case "${1:-start}" in
    start)
        start_freellmapi
        start_vite
        start_debate
        show_status
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        start_freellmapi
        start_vite
        start_debate
        show_status
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
