# Current State — Character Flow

_Last updated: 2025-09-14_

---

## Completed

### ✅ freellmapi minimal (`freellmapi/`)
- Slimmed to: keys, models, proxy, health, analytics(→usage), settings, rate-limits
- Added `/api/character/prompt`, `/api/character/quote/:theme`, `/api/character/laws`
- Client: only Keys + Usage pages

### ✅ Shared RAG Engine (`brain/rag.js`)
Three-tier hybrid retrieval, identical for both characters:
1. **BM25** — Okapi keyword relevance (pure JS)
2. **SQLite FTS5** — full-text search via virtual tables
3. **TF-IDF Cosine** — vector similarity over term-frequency vectors
Results deduplicated and re-ranked by weighted combination.

### ✅ Character 1: Izuku Midoriya
- `brain/izuku.js` — persona, generators, system prompt
- `tui_izuku.js` — readline TUI (cyan/green palette)
- Commands: `/quote` `/poem` `/idea` `/laws` `/search` `/status`
- DB: `data/knowledge.db` (40 quotes, 10 knowledge)

### ✅ Character 2: Mahina Artemis
- `brain/mahina.js` — Makima-coded persona, manipulation/dance/gym generators
- `tui_mahina.js` — readline TUI (pink/purple palette)
- Commands: `/quote` `/dance` `/gym` `/analyze` `/idea` `/laws` `/search` `/status`
- DB: `data/mahina_knowledge.db` (27 quotes, 10 knowledge)

### ✅ Documentation
- `docs/mission_plan.md`, `docs/current_state.md`, `docs/gain.md`
- `character-flow/README.md` — run guide

---

## Final Structure

```
/home/sword/Documents/Characters/
├── README.md
├── docs/
│   ├── mission_plan.md
│   ├── current_state.md
│   └── gain.md
├── freellmapi/              ← slimmed LLM proxy (port 3001)
│   └── server/src/app.ts    ← keys/proxy/health + /api/character/*
└── character-flow/          ← main product
    ├── brain/
    │   ├── rag.js            ← SHARED: BM25 + FTS5 + TF-IDF cosine
    │   ├── izuku.js          ← Izuku persona + generators
    │   ├── mahina.js         ← Mahina persona + generators
    │   ├── seed_izuku.js     ← seeds knowledge.db
    │   └── seed_mahina.js    ← seeds mahina_knowledge.db
    ├── tui_izuku.js          ← Izuku TUI
    ├── tui_mahina.js         ← Mahina TUI
    └── data/
        ├── knowledge.db      ← Izuku: 40 quotes, 10 knowledge
        └── mahina_knowledge.db ← Mahina: 27 quotes, 10 knowledge
```

---

## How to Run

```bash
# Terminal 1 — start shared server
cd /home/sword/Documents/Characters/freellmapi
npx tsx server/src/index.ts

# Terminal 2a — Izuku
cd /home/sword/Documents/Characters/character-flow
npm run izuku

# Terminal 2b — Mahina
npm run mahina
```

---

## Verified Working
- Both TUIs connect to proxy, load brains, run all commands
- Hybrid RAG returns ranked results from all 3 tiers
- No extra directories, flat structure as requested
