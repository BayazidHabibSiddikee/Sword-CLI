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
