# SwordCLI — AI Coding Assistant with Character Personas

> A multi-character AI coding assistant with persistent sessions, tool approvals, streaming, and free/paid LLM provider support.

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/BayazidHabibSiddikee/character-flow.git
cd character-flow
npm install --prefix swordcli

# Start everything (backend + agent + web UI)
./sword.mjs

# Or run the CLI directly
./sword.mjs --prompt "list files in the current directory"
```

## Architecture Overview

```
sword.mjs                          # Unified launcher (manages all services)
├── swordcli/server (port 3001)    # Main API: /v1/chat/completions + /api/*
├── sword-server (port 3101)       # Fallback minimal API (no install)
├── web UI (port 3002)             # Vite React dashboard
├── ollama (port 11434, optional)  # Local models
└── cli/flow.js                    # Main CLI agent (tools, sessions, approvals)
```

## Core Features

| Feature | Description |
|---------|-------------|
| **10 Character Personas** | Izuku, Mahina, Muhan, Plastos, Monk, Rishad, Turing, Sable, Ada, Kael — each with unique expertise, BM25 knowledge base, and skills |
| **Persistent Sessions** | SQLite-backed conversation history per character, survives restarts |
| **Tool Approvals** | Every file edit/command requires explicit `y/N` confirmation |
| **Free LLM Fallbacks** | Kilo, Pollinations, OpenCode Zen, g4f — no API keys needed |
| **Tool Suite** | File ops, git, web fetch, PDF, math, crypto, translation, code execution, tasks |
| **LangGraph Agent** | Optional LangGraph-powered agent loop with checkpointing |
| **Web Dashboard** | Vite React UI at `http://localhost:3002` |

## Quick Commands

```bash
# Launch everything (API + web + optional ollama)
./sword.mjs up

# Run CLI agent in current directory
./sword.mjs              # interactive
./sword.mjs -p "task"    # one-shot
./sword.mjs --session foo # persistent session

# Service management
./sword.mjs status       # show all service status
./sword.mjs logs         # tail service logs
./sword.mjs down         # stop everything

# Backend API only
./sword.mjs api          # start swordcli server on :3001
./sword.mjs backend      # start sword-server on :3101

# Web UI only
./sword.mjs web          # start Vite dev server on :3002
```

## Interactive CLI Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/exit` / `/quit` | Exit session |
| `/clear` | Clear conversation history |
| `/status` | Show session, model, cwd, history count |
| `/team` | Toggle 10-agent round-robin discussion mode |
| `/character <name>` | Switch character (izuku, mahina, kael, ada, turing, sable, muhan, plastos, monk, rishad) |
| `/model <name>` | Override model (auto, gemini-3.5-flash, etc.) |
| `/providers` | List/configure custom providers |
| `/rag add\|search` | Manage knowledge base |
| `/web <url>` | Open web UI |
| `/download\|/scrape <url>` | Fetch web content |
| `/tasks` | Task management (add, list, done, stats) |
| Ctrl+C | Cancel current turn (press again to exit) |
| Ctrl+D | Exit immediately |

## Character Personas

| Character | Role | Expertise |
|-----------|------|-----------|
| **izuku** | Philosopher Hero | Multi-laws wisdom, philosophy, systems thinking |
| **mahina** | Strategist Dancer | Manipulation, psychology, dance, gym |
| **muhan** | Math Professor & Trader | Crypto, stocks, quantitative analysis |
| **plastos** | War Reporter | Exposing false claims, investigative journalism |
| **monk** | Religious Scholar | Story-first teaching, theology |
| **rishad** | Comedy Lover | Manga, novels, humor |
| **turing** | Logic Master | Algorithms, competitive programming, math |
| **sable** | Pragmatic Engineer | Git, CI/CD, code review, debugging |
| **ada** | Computational Mathematician | Symbolic math, proofs, LaTeX, elegance |
| **kael** | ML Engineer | Model training, metrics, pipelines, embeddings |

## Free LLM Providers (No API Key Required)

| Provider | Models | Notes |
|----------|--------|-------|
| **Kilo** | Nemotron, Poolside, StepFun | 200 req/hr free, keyless |
| **Pollinations** | GPT-OSS 20B | Anonymous, queue-limited |
| **OpenCode Zen** | DeepSeek V4 Flash, Nemotron 3 Ultra | Promo trial, requires free account |
| **g4f** | Multiple | Last resort, often unstable |

> Set `SWORD_FREE_FALLBACK_URL` for custom free endpoints.

## Paid Provider Setup

```bash
# Option 1: Local swordcli backend (recommended)
./sword.mjs up  # starts swordcli on :3001 with unified key

# Option 2: Direct OpenAI-compatible endpoint
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o

# Option 3: Remote Sword backend
export SWORDCLI_BASE_URL=https://your-sword.example.com
export SWORDCLI_TOKEN=your-unified-key
```

## Configuration

Environment variables (or `.env` in project root):

```bash
# API Keys
OPENAI_API_KEY=           # OpenAI direct
SWORDCLI_TOKEN=           # Sword backend unified key
SWORDCLI_BASE_URL=        # Remote Sword backend (e.g. https://api.example.com)

# Free fallbacks
SWORD_FREE_FALLBACK_URL=  # Comma-separated OpenAI-compatible free endpoints

# Tool paths (optional overrides)
SWORD_TOOL_BRIDGE=        # Python tool bridge script
SWORD_TOOLS_DIR=          # External tools directory
SWORD_RESULTS_DIR=        # Output directory for tool results
SWORD_DOCS_ROOT=          # Document root for file_edit skill

# Features
SWORD_START_OLLAMA=1      # Auto-start ollama on :11434
```

## Project Structure

```
character-flow/
├── cli/                    # Main CLI agent
│   ├── flow.js            # Main entry (REPL, sessions, approvals)
│   ├── agent.js           # Turn loop, provider config, streaming
│   ├── tools.js           # File ops, git, web, PDF, math, code exec
│   ├── providerFallback.js # Free LLM fallback chain
│   ├── langgraph-agent.js # LangGraph agent (optional)
│   ├── brain/             # 10 character brains (BM25 + knowledge)
│   ├── skills/            # Git, file_edit, tasks, sessions, bridge
│   └── tui.js             # Alternative TUI (deprecated)
├── swordcli/              # Main API server (TypeScript)
│   ├── server/            # Express + /v1/* + /api/* routes
│   ├── client/            # Vite React web UI
│   └── server/data/       # SQLite (keys, models, sessions)
├── sword-server/          # Minimal plain-node API (fallback)
├── brain/                 # Character knowledge bases (SQLite)
├── skills/                # Shared skill implementations
├── data/                  # Sessions, RAG, tasks databases
├── docs/                  # Architecture docs
├── scripts/               # Utility scripts
├── web/                   # Vite React web UI
├── sword.mjs              # Unified launcher
└── package.json
```

## Development

```bash
# Install dependencies
npm install --prefix swordcli

# Run tests
npm test

# Run CLI tests only
node --test test/cli*.test.js

# Build web UI
npm run build --prefix swordcli/client
```

## Key Files

| File | Purpose |
|------|---------|
| `cli/flow.js` | Main CLI entry, REPL loop, session management |
| `cli/agent.js` | Turn execution, tool execution, provider routing |
| `cli/tools.js` | All tool definitions + execution logic |
| `cli/providerFallback.js` | Free LLM fallback chain (g4f + free endpoints) |
| `cli/model.js` | Model selection logic (prefers strong models) |
| `cli/backend.js` | Backend credential resolution |
| `cli/langgraph-agent.js` | LangGraph StateGraph agent factory |
| `swordcli/server/src/app.ts` | Main Express app with all routes |
| `swordcli/server/src/services/router.ts` | Model routing + bandit scoring |
| `sword.mjs` | Service launcher (manages all processes) |

## License

MIT — see [LICENSE](LICENSE)
