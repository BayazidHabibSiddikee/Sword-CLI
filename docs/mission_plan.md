# Mission Plan — Character Flow

## Vision
Build **Character Flow**: a philosopher-scholar AI character (Izuku Midoriya × Multi-Laws Wisdom)
that answers questions, generates quotes/poetry/business ideas, and connects everything
through universal laws — all served via a minimal FreeLLMAPI brain with a TUI chat client.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CHARACTER FLOW                       │
├──────────────────┬──────────────────┬───────────────────┤
│   TUI Client     │  freellmapi-     │  Brain Module     │
│  (npm run tui)   │  minimal         │  (izuku_char.js)  │
│                  │  (port 7070)     │                   │
│  • Keynav chat   │  • /v1/chat      │  • BM25 retrieval │
│  • Tab-complete  │  • /api/keys     │  • PG+SQLite      │
│  • History       │  • /api/usage    │  • Quote/poetry   │
│  • Streams       │                  │    generation     │
└──────────────────┴──────────────────┴───────────────────┘
```

---

## Phases

### Phase 1 — Foundation (CURRENT)
- [x] Analyze source repos: marin, freellmapi, tools/, channels/
- [ ] Create `docs/mission_plan.md` ← THIS FILE
- [ ] Create `docs/current_state.md`
- [ ] Create `docs/gain.md`
- [ ] Copy & slim freellmapi → `freellmapi-minimal/` (keys + usage pages only)
- [ ] Scaffold `character-flow/` project structure

### Phase 2 — Brain (freellmapi-minimal)
- [ ] Remove all non-essential routes: debate, business, embeddings, playground, premium, responses
- [ ] Keep only: `/v1/chat`, `/api/keys`, `/api/models`, `/api/health`, `/api/usage`
- [ ] Keep client pages: KeysPage + UsagePage (rename Analytics → Usage)
- [ ] Add character-specific endpoint: `/api/character/prompt` returning Izuku system prompt
- [ ] Test: server starts, keys page loads, proxy routes work

### Phase 3 — Character Module
- [ ] Build `brain/izuku_character.js` — core character logic
  - BM25 retriever over local knowledge DB
  - PostgreSQL ts_vector search (optional, falls back to SQLite)
  - Quote generator (themes: courage, growth, justice, etc.)
  - Poetry generator (law-grounded stanzas)
  - Business idea generator (law-backed concepts)
  - Philosophical answer engine (connects specific → universal)
- [ ] Seed database with preloaded wisdom (20 quotes, 20 laws, 10 knowledge entries)
- [ ] Wire brain into freellmapi-minimal as `/api/character/*` endpoints

### Phase 4 — TUI Client
- [ ] Create `tui/client.js` — terminal UI using Ink or blessed
- [ ] Features:
  - Streaming chat responses
  - Command palette (`/quote`, `/poem`, `/idea`, `/laws`, `/search <query>`)
  - Session history (persisted in SQLite)
  - Key shortcuts (↑↓ nav, Enter send, Ctrl+C exit)
- [ ] Entry point: `npm run tui` from project root

### Phase 5 — Integration
- [ ] TUI talks to freellmapi-minimal via `/v1/chat`
- [ ] Character brain injects system prompt + BM25 context before each call
- [ ] Quotes/poetry/ideas go through character endpoint directly
- [ ] Database lives at `character-flow/data/knowledge.db`

---

## File Structure (Target)

```
/home/sword/Documents/Characters/
├── mission_plan.md          ← this file
├── current_state.md         ← what's done / blocked / next
├── gain.md                  ← lessons learned, decisions made
│
├── freellmapi-minimal/      ← slimmed freellmapi (brain server)
│   ├── server/
│   │   ├── src/routes/keys.ts          (keep)
│   │   ├── src/routes/proxy.ts         (keep)
│   │   ├── src/routes/models.ts        (keep)
│   │   ├── src/routes/health.ts        (keep)
│   │   ├── src/routes/analytics.ts     ← rename to usage.ts
│   │   └── src/routes/  [debate,business,embeddings,playground,premium,responses].ts REMOVED
│   └── client/
│       └── src/pages/
│           ├── KeysPage.tsx            (keep)
│           ├── UsagePage.tsx           (renamed from AnalyticsPage)
│           └── [Playground,Fallback,Embeddings,Premium].tsx REMOVED
│
├── character-flow/          ← main product repo
│   ├── package.json
│   ├── brain/
│   │   ├── izuku_character.js       ← core character
│   │   ├── bm25_retriever.js        ← pure-Python→JS BM25
│   │   ├── db.js                    ← SQLite + PG layer
│   │   └── seed.js                  ← preloaded data
│   ├── tui/
│   │   └── client.js                ← Ink-based TUI
│   ├── data/
│   │   └── knowledge.db             ← seeded DB
│   └── docs/
│       └── architecture.md
│
└── docs/
    ├── mission_plan.md
    ├── current_state.md
    └── gain.md
```

---

## Key Decisions

1. **No bulky deps** — freellmapi-minimal strips debate/business/embeddings/playground/premium entirely
2. **BM25 in JS** — port the Python BM25 from marin to JavaScript for the TUI client
3. **SQLite primary, PG optional** — same schema as marin's izuku_character.py, works without Postgres
4. **Character is a system-prompt injector** — it prepends the Izuku persona + retrieved context to every /v1/chat call
5. **TUI first-class** — not a web wrapper; native terminal experience

---

## Blockers
- None currently

## Next Immediate Actions
1. Copy freellmapi → freellmapi-minimal/ and strip routes
2. Create brain/izuku_character.js (port from Python module)
3. Build TUI prototype
