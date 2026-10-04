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
| **Tool Suite** | File ops, git, web fetch, PDF, math, crypto, translation, code execution, tasks, **book download**, **email**, **Telegram** |
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

## Channels — send output to Telegram, Discord, Slack, webhooks

The dashboard's **Channels** page (`/connections`) saves a destination and sends
messages to it. Telegram is fully wired to the Bot API; Discord and Slack use their
incoming webhooks; a generic webhook posts JSON.

```bash
./sword.mjs up            # API :3001, web UI :3002
# open http://localhost:3002/connections
```

To add Telegram: create a bot with **@BotFather**, put the bot token in the form,
and set the target to your chat id (message the bot once, or use `@channelname`).
Hit **Verify** (`getMe`) then **Send**.

- Destinations are stored in `swordcli/server/data/channels.json` (mode `0600`).
- The bot token is **write-only**: the API never returns it, only `hasSecret`.
- Each connection shows an OpenClaw-style session key,
  `agent:<agentId>:<platform>:<kind>:<target>` (e.g. `agent:main:telegram:chat:123456789`).
- User-supplied webhook URLs must be `https` and must not resolve to a private or
  loopback host (SSRF guard).

REST surface: `GET/POST /api/channels`, `DELETE /api/channels/:id`,
`POST /api/channels/:id/verify`, `POST /api/channels/:id/send`.

## New Tools (v2.0+)

### `download_book` — Download books from Project Gutenberg & Open Library
```bash
# Search and download a book
download_book query="Pride and Prejudice" source=all format=text max_results=3
# → Searches both Project Gutenberg and Open Library, downloads as text

download_book query="Sherlock Holmes" source=gutenberg format=epub max_results=2
# → Downloads EPUB from Project Gutenberg only

download_book query="1984" source=openlibrary format=pdf download_dir=/tmp/books
# → Downloads PDF from Open Library to custom directory
```

**Parameters:**
- `query` (required): Search query (title, author, subject)
- `source`: `gutenberg`, `openlibrary`, or `all` (default: `all`)
- `format`: `text`, `epub`, `pdf` (default: `text`)
- `max_results`: 1-20 (default: 5)
- `download_dir`: Output directory (default: `./books`)

**Sources:**
- **Project Gutenberg** (gutenberg.org) — 70,000+ free ebooks, multiple formats
- **Open Library** (openlibrary.org) — Millions of books, lending library

### `send_email` — Send emails via SMTP
```bash
send_email to="user@example.com" subject="Hello" body="Hello world!" html_body="<b>Hello world!</b>" cc="cc@example.com"
```

**Required env vars:** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (optional, default false)

**Parameters:**
- `to` (required): Recipient email
- `subject` (required): Email subject
- `body` (required): Plain text body
- `html_body`: HTML body (optional)
- `cc`, `bcc`: CC/BCC recipients (optional)
- `attachments`: Array of file paths (optional)

### `read_email` — Read emails via IMAP
```bash
read_email folder="INBOX" search_query="unread" since="2024-01-01" limit=10 include_body=true
```

**Required env vars:** `IMAP_HOST`, `IMAP_PORT` (default 993), `IMAP_USER`, `IMAP_PASS`, `IMAP_TLS` (optional, default true)

**Parameters:**
- `folder`: IMAP folder (default: `INBOX`)
- `search_query`: Search query (e.g., "from:john", "unread")
- `since`, `before`: Date filters (ISO 8601)
- `limit`: Max emails (default 20, max 100)
- `include_body`: Include body text/html (default: true)

### `telegram_send` — Send messages via Telegram Bot API
```bash
telegram_send text="Hello from SwordCLI!" chat_id="123456789" parse_mode=markdown
```

**Required env vars:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (or pass `chat_id` param)

**Parameters:**
- `text` (required): Message text
- `chat_id`: Target chat ID (or set `TELEGRAM_CHAT_ID` env)
- `parse_mode`: `markdown` or `html` (default: `markdown`)
- `photo_url`: Photo URL to send (optional)
- `document_path`: Local file path to send as document (optional)

### `telegram_get_updates` — Get bot updates
```bash
telegram_get_updates offset=100 limit=50 timeout=30
```

**Required env var:** `TELEGRAM_BOT_TOKEN`

**Parameters:**
- `offset`: Update offset
- `limit`: Max updates (default 100)
- `timeout`: Long polling timeout in seconds (default 30)

### Routines — Standing Scheduled Tasks
```bash
# Add a daily routine
sword routine add nightly --prompt "Run tests and summarize failures" --schedule daily

# List all routines
sword routine list

# See the cron line to install
sword routine schedule nightly
# → 0 6 * * * cd /path && sword routine run nightly >> .flow/routines/nightly/cron.log 2>&1

# Run manually (headless, read-only)
sword routine run nightly --dry-run
# → would run: node cli/flow.js --prompt "..." --json --cwd /path

# Remove
sword routine remove nightly
```

**Schedules:** `on-demand` (default), `hourly`, `daily`, `weekdays`, `weekly`, `once`, `cron:"*/5 * * * *"`

---

### Environment Variables for New Tools

```bash
# Book download
SWORD_BOOKS_DIR=          # Default download directory (default: ./books)

# Email (SMTP)
SMTP_HOST=                # SMTP server hostname
SMTP_PORT=                # SMTP port (default: 587)
SMTP_USER=                # SMTP username
SMTP_PASS=                # SMTP password
SMTP_SECURE=              # Use SSL/TLS (true/false, default: false)

# Email (IMAP)
IMAP_HOST=                # IMAP server hostname
IMAP_PORT=                # IMAP port (default: 993)
IMAP_USER=                # IMAP username
IMAP_PASS=                # IMAP password
IMAP_TLS=                 # Use TLS (default: true)

# Telegram
TELEGRAM_BOT_TOKEN=       # Bot token from @BotFather
TELEGRAM_CHAT_ID=         # Default chat ID for telegram_send
```

---

### Quick Commands (updated)

```bash
# Routines
./sword.mjs routine add nightly --prompt "Run tests" --schedule daily
./sword.mjs routine list
./sword.mjs routine schedule nightly
./sword.mjs routine run nightly
./sword.mjs routine remove nightly
```

---

## Interactive CLI Commands (updated)

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
| `/routine <sub>` | Manage routines (add, list, schedule, run, remove) |
| Ctrl+C | Cancel current turn (press again to exit) |
| Ctrl+D | Exit immediately |

## Channels — send output to Telegram, Discord, Slack, webhooks

`vendor/agent-scripts/` is a checkout of [steipete/agent-scripts](https://github.com/steipete/agent-scripts),
providing the OpenClaw-era skills — `openclaw-relay`, `telecrawl`, `whatsapp`,
`discord-clawd`, `twilio-sms` and more. `cli/externalSkills.js` discovers
`vendor/agent-scripts/skills` alongside the home-directory roots, so these are
available with no global sync step. Discover and load them with the CLI:

```bash
node --input-type=module -e "import {discoverSkills} from './cli/externalSkills.js'; console.log((await discoverSkills()).map(s=>s.name).join('\n'))"
```

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
├── swordcli/              # Main API server + web UI (TypeScript)
│   ├── server/            # Express + /v1/* + /api/* routes
│   ├── client/            # Vite React web UI
│   └── server/data/       # SQLite (keys, models, sessions)
├── sword-server/          # Minimal plain-node API (fallback)
├── brain/                 # Legacy TUI shims (tui_*.js) — reference live cli/brain + cli/skills at runtime
├── data/                  # Sessions, RAG, tasks databases
├── docs/                  # Architecture docs, incl. limitations_plan.md + hygiene_phase5.md
├── scripts/               # Utility scripts
├── vendor/agent-scripts/  # Vendored steipete/agent-scripts skills (openclaw-relay, telecrawl, …)
├── character-flow/        # Nested legacy duplicate of this repo — excluded, do not edit
├── sword.mjs              # Unified launcher
└── package.json
```

## Known Limitations

SwordCLI is under active remediation. The full plan, with per-item evidence, is in
**[docs/limitations_plan.md](docs/limitations_plan.md)**; the repo-hygiene analysis is in
**[docs/hygiene_phase5.md](docs/hygiene_phase5.md)**. Provider/key setup is documented in
**[docs/channels.md](docs/channels.md)**.

### Landed

- **Phase 0 — correctness.** Loop-guard, atomic writes and web-mount fixes.
- **Phase 1 — context budget.** Context budgeting, honest degradation, session diff, and archive-on-save.
- **Phase 2 — execution engine.** Parallel tool execution, batched edits, optional sandbox.
- **Phase 3 — provider resilience.** Retry/backoff with a circuit breaker, capability tracking, usage accounting.
- **Phase 4 — ecosystem.** Skills integration and team state.
- **Phase 5 — repo hygiene (landed).** Single RAG source (`cli/brain/rag.js`; the
  `brain/rag.js` duplicate is removed) and single skill surface (`cli/skills/`;
  the root `skills/` duplicate is removed). `cli/flow.js` now imports
  `./skills/sessions.js`, and `cli/tools.js` + `cli/historyArchive.js` resolve the
  RAG engine at `./brain/rag.js`. The `providers.ts` type narrowing is fixed and
  the server typechecks clean; `character-flow/.git` (nested repo) is removed and
  `character-flow/character-flow/` stays excluded via `.gitignore`.

### Pending / known gaps

- **RAG engines are intentionally separate.** `cli/brain/rag.js` (CLI, SQLite)
  and `swordcli/server/src/services/rag.ts` (server, filesystem JSON) share no
  schema and no code — different runtimes, different callers (CLI tools vs HTTP
  `ragRouter`). See [docs/hygiene_phase5.md §5.2](docs/hygiene_phase5.md).
- **`cli/skills/agents/` does not exist**, but `cli/tui.js` and four `cli/brain/*.js` modules import
  from it. Switching to the Sable / Turing / Ada / Kael personas in the TUI will fail to load until
  this is restored or the persona entries are removed.
- **`character-flow/` (713 tracked files) is a nested copy of this repo** sharing the same origin.
  Its inner `.git/` is removed so tooling resolves the root repo; the directory itself
  is still tracked and `character-flow/character-flow/` stays `.gitignore`d.
  `character-flow/freellmapi` holds 341 files with no root counterpart and must be
  relocated before the directory can be untracked.
- **`brain/` at the repo root holds only `tui_*.js` shims** — they resolve against
  `cli/brain/` + `cli/skills/` at runtime.
- **Skill discovery is budget-limited**: only a small alphabetical prefix of discovered skills fits the
  prompt budget, so skill availability is not uniform across sessions.
- **Sandboxing is opt-in and best-effort.** It relies on `bwrap`/`firejail` where present; there is no
  network isolation guarantee on platforms lacking both.

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

### Rating & Comparison (2026-10-02)

**Overall: 7.6 / 10** — strong core, honest about limitations, actively closing the worst gaps from earlier audits. All 133 tests pass.

#### Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Agent safety | 9/10 | Per-tool grants (y/a/A/N), deny-overrides-allow, 3-tier loop detection, mistake guard, prompt-injection scan on skills |
| Tool surface | 7/10 | 10 tools; `read_file` offset/limit + 2 MiB cap, EOL-normalised ambiguity-fatal edits. No parallel calls or MCP in CLI |
| Rollback / undo | 9/10 | Private git refs, `read-tree --reset -u`, index backup, stash untouched |
| Context management | 7/10 | Auto-archive at 200 messages into RAG; no per-message budget projection |
| Session persistence | 8/10 | Named local sessions + shared backend + recovery on failure |
| RAG / knowledge | 8/10 | Hybrid BM25 + cosine + FTS5, web upload for PDF/MD only |
| Skill integration | 8/10 | Discovers 177 skills across 4 home dirs; hidden from UI, progressive disclosure via `load_skill` tool |
| Team mode | 6/10 | 10 persona round-robin with writer aggregation; basic but working |
| Provider resilience | 7/10 | g4f fallback, declared degraded mode, SSE fragment reassembly |

#### vs. Cline

| Feature | SwordCLI | Cline |
|---|---|---|
| Tool approval | ✅ Per-tool grants, deny-overrides-allow | ✅ Rejection suffix |
| Rollback / undo | ✅ Git private ref | ❌ None |
| Parallel tools | ❌ Sequential | ✅ Native |
| MCP support | ⚠️ Server only | ✅ Full client |
| Context budget | ⚠️ 200-msg archive | ✅ Token-level projection |
| Web UI | ✅ Vite + React | ❌ VSCode only |
| Size | ~2 MB source | 398 MB npm install |

#### vs. Aider

| Feature | SwordCLI | Aider |
|---|---|---|
| Git integration | ✅ Checkpoint + undo | ✅ Native |
| File editing | ✅ Ambiguity-fatal exact match | ✅ Fuzzy + strict modes |
| Multi-file edit | ⚠️ Sequential | ✅ Multiple per turn |
| LLM cost tracking | ❌ None | ✅ Per-model token usage |
| Remote editing | ❌ Local only | ✅ SSH / Codespaces |

#### vs. Gemini CLI

| Feature | SwordCLI | Gemini CLI |
|---|---|---|
| Tool safety | ✅ Explicit approval gates | ❌ Auto-executes |
| Rollback | ✅ Git checkpoint | ❌ None |
| Open source | ✅ Fully auditable | ❌ Closed |
| Skill loading | ✅ Progressive disclosure | ❌ None |

#### vs. OpenDevin

OpenDevin is a container-based orchestration platform (~2 GB). Different category — SwordCLI competes in the single-process CLI-agent lane.

#### Honest gaps still open

1. **Parallel tool execution** — independent reads could run concurrently via `Promise.all`
2. **MCP in the CLI** — server has `rag-mcp-server.ts` but it isn't wired to the REPL
3. **Context budget projection** — token-count-per-message would let the 200-msg threshold adapt dynamically
4. **Session diff view** — `/diff` to see what changed between turns would improve auditability
5. **g4f dependence** — free-tier LLM is flaky (status 526); a local fallback (ollama) would be more stable

## License

MIT — see [LICENSE](LICENSE)
