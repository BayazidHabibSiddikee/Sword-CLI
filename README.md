# Character Flow — Run Guide

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
