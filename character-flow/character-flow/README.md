# Coding CLI (new)

The active package is `/home/sword/Documents/Characters/character-flow/character-flow`.
Node.js 22+ is required. The new CLI uses Node built-ins; it does not need the web
server, character databases or LangChain. A running OpenAI-compatible chat
endpoint with tool calling support is required for actual tasks.

```bash
cd /home/sword/Documents/Characters/character-flow/character-flow
node /home/sword/Documents/Characters/character-flow/character-flow/cli/flow.js --help
export OPENAI_BASE_URL=http://localhost:3001/v1
export OPENAI_MODEL=auto
# Set OPENAI_API_KEY in your environment if the endpoint requires authentication.
npm run flow -- --cwd /home/sword/Documents/Characters --session coding
```

Use the model ID supported by your endpoint; `auto` requires a proxy that supports it.
Remote endpoints must use HTTPS. No embedded credential is used by the new CLI.
For a direct executable command, optionally run `npm link --ignore-scripts` from
this package, then invoke `flow` from your project directory.

One-shot, machine-readable output:

```bash
node /home/sword/Documents/Characters/character-flow/character-flow/cli/flow.js --cwd /home/sword/Documents/Characters --prompt "Inspect this project and explain its architecture" --json
```

Capabilities: interactive conversation, a bounded model/tool loop, file listing,
literal text search, file reading, exact text edits, file creation, approved
commands, and optional named sessions. `/help`, `/clear`, and `/exit` are supported.
The previous character interface remains available through `npm run flow:tui`.

## Marketing and video-editing mode

```bash
cd /home/sword/Documents/Characters/character-flow/character-flow
npm run flow -- --mode marketing-video --cwd /home/sword/Documents/Characters --session campaign-demo
```

Example first request: "Help me plan a 15-second vertical product ad. Ask for my
product, audience, offer, brand voice and asset paths first. Then propose three
hooks, a timed storyboard and one CTA. Save the script after approval; create
and verify a small local preview before any final export."

This mode adds an intake → strategy → script/storyboard → edit → verification →
measurement workflow to the existing agent/tool loop. It guides the model to use
FFmpeg/ffprobe through individually approved commands. FFmpeg and ffprobe must
be installed; they are available on this development machine, not bundled.
Original media must be preserved (`-nostdin -n`, never `-y`), and output metadata
must be compared against the agreed plan. Use separate session names for coding
and campaigns: sessions retain conversation history, not a stored mode choice.

The built-in workflow is guidance, not proof of expert model performance. There
is no image/video/audio perception tool: human review is required for framing,
sound, spelling, brand fidelity and creative quality. No automatic publishing,
ad spending or uploads are added. Model quality depends on your selected provider.

Tests include prompt routing, real synthetic-media rendering/probing, source-hash
preservation and denied exports. The render test explicitly skips if local media
tools are absent. A manual PTY acceptance check also exercised the complete CLI,
approval prompts, script creation and a real preview with a local mock model.
Neither fixture evaluates live-model marketing judgment.


Safety and current limits:
- Every edit and command asks for a separate `y` approval. Without a terminal,
  these actions are denied; read-only tasks still work.
- Commands execute with your OS permissions, **not in a sandbox**. Only approve
  commands you understand. They can access resources beyond the project.
- File tools reject paths outside the project, symlinks, hidden paths, selected
  key/database extensions, and dependency/build directories. This is not a
  comprehensive secret detector or protection from concurrent hostile local processes.
- File text is limited to 64,000 characters/bytes checks; listing to 500 files;
  searches to 100 results. Tool context is truncated at about 16 KB.
- CLI commands and provider requests time out after 120 seconds. Commands have
  bounded captured output; reaching the capture limit does not kill the command.
- There are 20 model steps per turn and a 500,000-character context budget.
  No streaming, automatic compaction, MCP, or multi-agent orchestration yet.
- Optional session history is plaintext in PROJECT/.flow/NAME.json. Keep that
  directory out of version control. File contents/tool results go to your provider.
- Existing exposed credentials must still be revoked/rotated at the provider;
  removing them from source does not remove them from Git history.

Validation: `npm test` and `npm run test:coverage` from the package directory.
Tests use temporary workspaces and a local mock HTTP model, not a paid live provider.

---


# Character Flow

Two philosopher-characters, one shared brain server.

## Architecture

```
character-flow/
├── brain/
│   ├── rag.js              ← SHARED: Hybrid RAG (BM25 + SQLite FTS5 + TF-IDF cosine)
│   ├── izuku.js            ← Izuku Midoriya persona + generators
│   ├── mahina.js           ← Mahina Artemis persona + generators
│   ├── seed_izuku.js       ← Seeds knowledge.db
│   └── seed_mahina.js      ← Seeds mahina_knowledge.db
├── tui_izuku.js            ← Izuku TUI client
├── tui_mahina.js           ← Mahina TUI client
├── data/
│   ├── knowledge.db        ← Izuku's DB (40 quotes, 10+ knowledge)
│   └── mahina_knowledge.db ← Mahina's DB (27 quotes, 10+ knowledge)
└── package.json
```

**Shared RAG Engine** (`brain/rag.js`):
- **BM25** — Okapi keyword relevance (pure JS, no deps)
- **SQLite FTS5** — Full-text search via virtual tables
- **TF-IDF Cosine** — Vector similarity over term-frequency vectors
- Three-tier merge: results deduplicated and re-ranked by combined score

---

## Quick Start

```bash
# 1. Start the shared brain server (port 3001)
cd /home/sword/Documents/Characters/freellmapi
npx tsx server/src/index.ts

# 2. Launch either character in another terminal:

# Izuku — the analytical hero
cd /home/sword/Documents/Characters/character-flow
npm run izuku

# Mahina — the Makima-coded strategist
npm run mahina
```

---

## Izuku Commands

| Command | Description |
|---------|-------------|
| `/quote [theme]` | Philosophical quote (courage, growth, justice, etc.) |
| `/poem [topic]` | Law-grounded poetry |
| `/idea [domain]` | Business idea from a universal law |
| `/laws` | List all 20 universal laws |
| `/search <q>` | Hybrid RAG search (BM25 + FTS5 + TF-IDF) |
| `/status` | DB stats + proxy connection + RAG tier info |

---

## Mahina Commands

| Command | Description |
|---------|-------------|
| `/quote [theme]` | Quote on manipulation, dance, gym, or defense |
| `/dance [topic]` | Dance philosophy on control, attention, movement |
| `/gym [topic]` | Training protocol grounded in laws |
| `/analyze [topic]` | Manipulation breakdown with counter-tactics |
| `/idea [domain]` | Business idea from power/dance/gym laws |
| `/laws` | 15 Makima-coded core principles |
| `/search <q>` | Hybrid RAG search (BM25 + FTS5 + TF-IDF) |
| `/status` | DB stats + proxy connection + RAG tier info |

---

## Live Chat

Type any normal question (no `/`) and it routes through freellmapi to your configured LLM model, with the character's system prompt + BM25-retrieved context prepended automatically.

Configure your model key at http://localhost:3001/keys
