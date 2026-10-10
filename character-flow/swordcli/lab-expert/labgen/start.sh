#!/bin/bash
# LabGen Cyberdeck Terminal - Startup Script

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     LABGEN CYBERDECK TERMINAL v2.4.1 - STARTUP SEQUENCE      ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[INIT]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check system dependencies
check_deps() {
    log "Checking system dependencies..."
    
    deps=("python3" "freecadcmd" "ngspice" "tectonic" "tesseract" "pdftoppm")
    for dep in "${deps[@]}"; do
        if command -v "$dep" &> /dev/null; then
            success "$dep found"
        else
            warn "$dep not found - some features may be limited"
        fi
    done
}

# Setup Python environment
setup_python() {
    log "Using marin_venv Python environment..."
    
    cd "$ROOT_DIR/backend"
    
    source /home/sword/marin_venv/bin/activate
    
    log "Verifying Python dependencies..."
    pip install -r requirements.txt
    
    success "Python environment ready"
}

# Build frontend
build_frontend() {
    log "Building frontend..."
    
    cd "$ROOT_DIR/frontend"
    
    if [ ! -d "node_modules" ]; then
        log "Installing npm dependencies..."
        npm install > /dev/null 2>&1
    fi
    
    log "Building production bundle..."
    npm run build > /dev/null 2>&1
    
    success "Frontend built"
}

# Initialize RAG index
init_rag() {
    log "Initializing RAG index..."
    
    cd "$ROOT_DIR"
    
    python3 -c "
import sys
sys.path.append('labgen')
from pipeline.rag import build_rag_index
build_rag_index()
" 2>/dev/null
    
    success "RAG index initialized"
}

# Start backend server
start_backend() {
    log "Starting backend server..."
    
    cd "$ROOT_DIR/backend"
    source /home/sword/marin_venv/bin/activate
    
    # Run in background
    nohup python -m uvicorn server:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &
    BACKEND_PID=$!
    
    # Wait for server to start
    sleep 3
    
    if curl -s http://localhost:8000/api/health > /dev/null; then
        success "Backend server running on http://localhost:8000 (PID: $BACKEND_PID)"
    else
        error "Backend failed to start"
        cat backend.log
        exit 1
    fi
}

# Start frontend dev server (for development)
start_frontend_dev() {
    log "Starting frontend dev server..."
    
    cd "$ROOT_DIR/frontend"
    
    nohup npm run dev > frontend.log 2>&1 &
    FRONTEND_PID=$!
    
    sleep 2
    
    success "Frontend dev server running on http://localhost:5173 (PID: $FRONTEND_PID)"
}

# Main startup sequence
main() {
    echo ""
    check_deps
    echo ""
    setup_python
    echo ""
    build_frontend
    echo ""
    init_rag
    echo ""
    start_backend
    echo ""
    
    # Check if running in development mode
    if [ "$1" == "--dev" ]; then
        start_frontend_dev
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  DEVELOPMENT MODE ACTIVE                                      ║${NC}"
        echo -e "${GREEN}║  Frontend: http://localhost:5173                              ║${NC}"
        echo -e "${GREEN}║  Backend:  http://localhost:8000                              ║${NC}"
        echo -e "${GREEN}║  API Docs: http://localhost:8000/docs                         ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    else
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  PRODUCTION MODE                                              ║${NC}"
        echo -e "${GREEN}║  Frontend served at: http://localhost:8000                    ║${NC}"
        echo -e "${GREEN}║  API Docs: http://localhost:8000/docs                         ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    fi
    
    echo ""
    echo "Press Ctrl+C to stop all services"
    echo ""
    
    # Keep script running
    trap "echo 'Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
    wait
}

# Run main
main "$@"