# SwordCLI — Run Guide

## Sword CLI — launch from this repository root

```bash
cd /home/sword/Documents/Characters
npm run sword                      # shared session, visible in the web app
npm run sword -- --help            # all options, no model contact
npm run sword -- --local --session notes   # local-only, no web sharing
```

Requires Node.js 22+ and a running provider. By default the CLI connects to
`http://127.0.0.1:3001/v1` and reads the unified key **read-only** from
`/home/sword/Documents/Characters/freellmapi/server/data/freeapi.db`, using the
backend's installed SQLite dependency. It does not print or copy the key into
source. An unrelated inherited `OPENAI_API_KEY` no longer breaks this default.
Explicit `OPENAI_BASE_URL`/`PROXY_HOST` configuration retains its own credentials.
For another freellmapi instance, set `SWORDCLI_BASE_URL` and `SWORDCLI_TOKEN`;
remote instances require HTTPS and never receive the locally discovered key.
No root dependency install is required. Bare launch needs a terminal;
non-interactive use requires `--prompt "your task"`.

### SwordCLI web + shared memory

`sessions` are shared by default: `npm run sword` creates a backend session and
prints its ID, so the conversation is visible and continuable in the web app.
Restart your existing backend process after updating; do not start a second
server on the same port. The backend serves the built web UI itself:

```bash
cd /home/sword/Documents/Characters/freellmapi
HOST=127.0.0.1 npm run dev     # rebuild the UI with: npm run build -w client
```

Open **http://localhost:3001/sword** and enter your backend unified API key in
the password field (also shown on the existing Keys page). For live UI editing
instead, `HOST=127.0.0.1 npm run dev` also serves the Vite dev server on
`http://localhost:5173/sword`. The key stays in page memory, not browser
storage. The page lists, creates, reads and deletes shared sessions, chats,
displays summaries, and searches history with source IDs. Web chat is
**text-only**: it cannot execute tools or edit files. CLI tool execution remains
explicitly approval-gated and unsandboxed.

Useful session options:

```bash
cd /home/sword/Documents/Characters
npm run sword                      # shared + web-visible (default)
npm run sword -- --mode marketing-video
npm run sword -- --local --session campaign   # local-only file, no web sharing
npm run sword -- --shared-session YOUR_SESSION_ID   # resume an existing one
npm run sword -- --shared --import-session campaign # copy a local session up
```

Resume using the same absolute `--cwd` as the session's workspace. Plain
`--session NAME` remains local-only; unnamed ordinary chats are not persisted.
Only shared/imported sessions are indexed. No automatic filesystem scan occurs.

- Full shared transcripts persist in SQLite (maximum 1 MiB per session).
- Session memory: up to **100 extractive lines**, at most 12,000 characters.
- Workspace-wide memory: up to **50 outcome lines**, at most 6,000 characters.
- Retrieval: SQLite FTS5 lexical search, up to five relevant chunks with source
  IDs; **not semantic embeddings**. Summary/retrieval context is capped at
  14,000 characters; the CLI retains a bounded suffix of complete recent turns.
- Summaries are deterministic text extracts, not model-written understanding.
  Historical claims are not independently verified. Recognizable secrets are
  redacted from derived memory on a best-effort basis; raw transcripts remain
  sensitive. Deletion and `/clear` remove corresponding derived memory.
- Revision conflicts prevent overwriting newer web/CLI history. Failed shared
  saves and caught mid-turn failures create a local recovery record when
  possible. Review it before retrying: partial tool batches may not be safely
  resumable. Hard crashes are not journaled durably per action.

### Choosing the model

The backend's router defaults to `routing_strategy = balanced`, which mixes speed
with quality and served `gemini-3.5-flash-lite` (rank 16) and `glm-4.7-flash` for
real coding work — produced code that looked plausible but was broken. SwordCLI
therefore resolves a model in this order:

1. `--model <id>` — explicit override
2. `SWORD_MODEL` environment variable
3. the strongest model the backend actually advertises (intersected with
   `GET /v1/models`, so a retired id can never pin the CLI to an unservable model)
4. the backend default (`auto`)

```bash
npm run sword -- --model gemini-3.6-flash   # pin explicitly
SWORD_MODEL=moonshotai/Kimi-K3 npm run sword
```

Measured difference on the same task (a yt-dlp → Telegram uploader): with
`auto`/balanced the model emitted a broken script (`bytes.fromhex(VIDEO_URL)`
assigned to `bot`, requirements listing a library the code never imports) and
claimed a syntax check proved it worked. With a rank-2 model it produced a
complete implementation (proper `yt_dlp` usage, multipart `sendVideo`, argparse,
cleanup in `finally`) and verified it with a real import check.

### Local-only deployment
but legacy freellmapi admin/agent routes remain unauthenticated. Keep the whole
backend bound to loopback; do not expose it to a LAN or the Internet. This is
not a multi-user authorization system. New code does not restart a running
server or change an existing process's bind address.


---


Two philosopher-characters, one shared brain server.

## Start the Server (once)

```bash
cd /home/sword/Documents/Characters/freellmapi
npx tsx server/src/index.ts
# or keep running in background:
# npx tsx server/src/index.ts &
```

Server runs on port 3001. Character API endpoints at `/api/character/*`.

---

## Character 1: IZUKU — The Analytical Hero

```bash
cd /home/sword/Documents/Characters/character-flow
node tui/client.js
```

**Persona:** Izuku Midoriya × Multi-Laws Wisdom — earnest notebook-taker who connects everything through universal laws.

**Commands:**
| Command | Description |
|---------|-------------|
| `/quote [theme]` | Philosophical quote (courage, growth, justice, etc.) |
| `/poem [topic]` | Law-grounded poetry |
| `/idea [domain]` | Business idea from a universal law |
| `/laws` | List all 20 universal laws |
| `/search <query>` | BM25 search across knowledge base |
| `/status` | DB stats + proxy connection |
| `/clear` | Clear history |
| `/help` | Show commands |

Normal text → routes through freellmapi proxy to your LLM model with Izuku persona + BM25 context.

---

## Character 2: MAHINA ARTEMIS — The Strategist Dancer

```bash
cd /home/sword/Documents/Characters/character-flow
node mahina-tui/client.js
```

**Persona:** Makima-coded gym girl + dancer. Sees every interaction as power dynamics. Calm, surgical, always three steps ahead. Teaches manipulation, defense, and discipline.

**Commands:**
| Command | Description |
|---------|-------------|
| `/quote [theme]` | Quote (manipulation, dance, gym, defense) |
| `/dance [topic]` | Dance philosophy on control, attention, movement |
| `/gym [topic]` | Training protocol grounded in laws |
| `/analyze [topic]` | Manipulation analysis with defenses |
| `/idea [domain]` | Business idea from power/dance/gym laws |
| `/laws` | 15 core Mahina principles |
| `/search <query>` | BM25 search across her knowledge base |
| `/status` | DB stats + proxy connection |
| `/clear` | Clear history |
| `/help` | Show commands |

Normal text → routes through freellmapi proxy with Mahina persona + her BM25 context.

---

## Shared Infrastructure

- **freellmapi** (port 3001): OpenAI-compatible proxy + `/api/character/*` endpoints
- **Both TUIs**: Same proxy host, separate brains, separate databases, separate history
- **BM25**: Each character has independent keyword retrieval over their own SQLite DB
- **Live chat**: Both route through the same proxy to whichever LLM you configure

---

## File Structure

```
/home/sword/Documents/Characters/
├── docs/
│   ├── mission_plan.md
│   ├── current_state.md
│   └── gain.md
├── freellmapi/              ← slimmed LLM proxy (port 3001)
│   └── server/src/app.ts    ← keys/proxy/models/health + /api/character/*
├── character-flow/          ← main product
│   ├── brain/izuku_character.js   ← Izuku's BM25 + generators
│   ├── brain/seed.js
│   ├── mahina-brain/mahina_character.js  ← Mahina's BM25 + generators
│   ├── mahina-brain/seed.js
│   ├── tui/client.js              ← Izuku TUI
│   ├── mahina-tui/client.js       ← Mahina TUI
│   ├── data/knowledge.db          ← Izuku's DB (40 quotes, 10+ knowledge)
│   ├── data/mahina_knowledge.db   ← Mahina's DB (27 quotes, 10+ knowledge)
│   ├── package.json
│   └── README.md
└── README.md
```
