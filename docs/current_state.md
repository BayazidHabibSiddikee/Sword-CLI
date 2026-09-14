# Current State — Character Flow

_Last updated: 2025-09-14_

---

## Completed

### ✅ freellmapi minimal (`freellmapi/`)
- Slimmed to: keys, models, proxy, health, analytics(→usage), settings, rate-limits
- Added `/api/character/prompt`, `/api/character/quote/:theme`, `/api/character/laws`
- Client: only Keys + Usage pages

### ✅ Shared RAG Engine (`character-flow/brain/rag.js`)
Three-tier hybrid retrieval, identical for each character:
1. **BM25** — Okapi keyword relevance (pure JS)
2. **SQLite FTS5** — full-text search via virtual tables
3. **TF-IDF Cosine** — vector similarity over term-frequency vectors
Results deduplicated and re-ranked by weighted combination.

### ✅ Character 1: Izuku Midoriya
- `character-flow/brain/izuku.js` — persona, generators, system prompt
- `character-flow/tui_izuku.js` — readline TUI (cyan/green palette)
- Commands: `/quote` `/poem` `/idea` `/laws` `/search` `/status`
- DB: `character-flow/data/knowledge.db` (40 quotes, 10 knowledge)

### ✅ Character 2: Mahina Artemis
- `character-flow/brain/mahina.js` — Makima-coded persona, manipulation/dance/gym generators
- `character-flow/tui_mahina.js` — readline TUI (pink/purple palette)
- Commands: `/quote` `/dance` `/gym` `/analyze` `/idea` `/laws` `/search` `/status`
- DB: `character-flow/data/mahina_knowledge.db` (27 quotes, 10 knowledge)

### ✅ Character 3: Muhan Haswaz
- `character-flow/brain/muhan.js` — alpha male math professor, crypto/stocks trading
- `character-flow/tui_muhan.js` — readline TUI
- Commands: `/quote` `/trade` `/stats` `/news`
- DB: `character-flow/data/muhan_knowledge.db`

### ✅ Character 4: Plastos Jiade
- `character-flow/brain/plastos.js` — female war/economy reporter, exposes false claims
- `character-flow/tui_plastos.js` — readline TUI
- Commands: `/quote` `/crash` `/debunk` `/news`
- DB: `character-flow/data/plastos_knowledge.db`

### ✅ Character 5: Monk Maecenas
- `character-flow/brain/monk_maecenas.js` — Buddhist-Christian syncretic religious scholar
- Story-first teaching method, chapter-by-chapter iteration across all religions
- Built-in religious story database (Buddhism, Christianity, Islam, Hinduism, Taoism, Judaism)
- Cross-reference between traditions
- `character-flow/tui_monk_maecenas.js` — readline TUI (magenta/cyan palette)
- `character-flow/brain/seed_monk.js` — seed script
- DB: `character-flow/data/monk_knowledge.db` (20 knowledge, 20 quotes)

### ✅ Character 6: Prince Rishad Gazi
- `character-flow/brain/prince_rishad.js` — alcohol/cigarette-addicted comedy lover, manga & novel enthusiast
- Explains stories with humor, self-deprecating wit, anime metaphors
- Built-in manga/novel database (One Piece, AoT, Naruto, Dostoevsky, Kafka, Hitchhiker's)
- `character-flow/tui_prince_rishad.js` — readline TUI (orange palette)
- `character-flow/brain/seed_prince.js` — seed script
- DB: `character-flow/data/rishad_knowledge.db` (20 knowledge, 24 quotes)

### ✅ Character 7: Turing Voss — Logic Puzzle Master & Algorithm Designer
- `character-flow/brain/turing_voss.js` — first-principles thinking, puzzle-based teaching
- Built-in logic puzzles (Blue-Eyed Islanders, Counterfeit Coin, Hat Puzzle, Desert Crossing, Two Eggs)
- Teaches through reduction: axioms → deduction → verification
- Domains: algorithms, complexity theory, logic, data structures, proof techniques
- `character-flow/tui_turing_voss.js` — readline TUI (purple palette)
- `character-flow/brain/seed_turing.js` — seed script
- DB: `character-flow/data/turing_knowledge.db` (50 knowledge, 15 puzzles)

### ✅ Character 8: Sable Chen — Pragmatic Full-Stack Engineer
- `character-flow/brain/sable_chen.js` — 15 years shipping production code
- Cynical about hype, obsessive about correctness and reliability
- Built-in postmortem cases (cascading timeouts, N+1 queries, merge conflicts, retry loops)
- Engineering axioms for architecture, debugging, testing, security
- `character-flow/tui_sable_chen.js` — readline TUI (orange palette)
- `character-flow/brain/seed_sable.js` — seed script
- DB: `character-flow/data/sable_knowledge.db` (40 knowledge, 12 postmortems)

### ✅ Character 9: Dr. Ada Vance — Computational Mathematician
- `character-flow/brain/ada_vance.js` — finds poetry in algorithms, elegance in abstraction
- Connects code to mathematics, history, and human creativity
- Theorem cards with intuition (Euler's Identity, Four Color Theorem, Prime Number Theorem, etc.)
- Warm but exacting tone — celebrates beauty, dismantles unnecessary complexity
- `character-flow/tui_ada_vance.js` — readline TUI (teal palette)
- `character-flow/brain/seed_ada.js` — seed script
- DB: `character-flow/data/ada_knowledge.db` (20 knowledge, 5 theorems)

### ✅ Character 10: Kael Vector — ML Engineer & Model Architect
- `character-flow/brain/kael_vector.js` — thinks in distributions, dreams in gradients
- Model architecture cards (Transformer, CNN, GNN, Diffusion, Mamba) with strengths/weaknesses
- Explains ML concepts with everyday analogies
- Covers training dynamics, evaluation, production ML, and AI safety
- `character-flow/tui_kael_vector.js` — readline TUI (green palette)
- `character-flow/brain/seed_kael.js` — seed script
- DB: `character-flow/data/kael_knowledge.db` (20 knowledge, 10 model cards)

### ✅ Tools
- `character-flow/tools/web.js` — DDG search, Wikipedia, RSS feeds
- `character-flow/tools/books.js` — Gutenberg/Internet Archive book discovery
- `character-flow/tools/market.js` — crypto prices, stock data, fear&greed index
- `character-flow/tools/news.js` — Reuters/BBC/AlJazeera/Bloomberg RSS aggregation

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
└── character-flow/          ← main product (git repo)
    ├── brain/
    │   ├── rag.js                  ← SHARED: BM25 + FTS5 + TF-IDF cosine
    │   ├── izuku.js                ← Izuku: philosopher hero
    │   ├── mahina.js               ← Mahina: strategist
    │   ├── muhan.js                ← Muhan: math professor/trader
    │   ├── plastos.js              ← Plastos: war reporter
    │   ├── monk_maecenas.js        ← Monk: religious scholar (stories)
    │   ├── prince_rishad.js        ← Rishad: manga/novel comedy lover
    │   ├── turing_voss.js          ← Turing: logic & algorithm puzzle master
    │   ├── sable_chen.js           ← Sable: pragmatic full-stack engineer
    │   ├── ada_vance.js            ← Ada: computational mathematician
    │   ├── kael_vector.js          ← Kael: ML engineer & model architect
    │   ├── seed_izuku.js
    │   ├── seed_mahina.js
    │   ├── seed_muhan.js
    │   ├── seed_plastos.js
    │   ├── seed_monk.js
    │   ├── seed_prince.js
    │   ├── seed_turing.js
    │   ├── seed_sable.js
    │   ├── seed_ada.js
    │   └── seed_kael.js
    ├── tui_izuku.js          ← Izuku TUI
    ├── tui_mahina.js         ← Mahina TUI
    ├── tui_muhan.js          ← Muhan TUI
    ├── tui_plastos.js        ← Plastos TUI
    ├── tui_monk_maecenas.js  ← Monk Maecenas TUI
    ├── tui_prince_rishad.js  ← Prince Rishad TUI
    ├── tui_turing_voss.js    ← Turing Voss TUI
    ├── tui_sable_chen.js     ← Sable Chen TUI
    ├── tui_ada_vance.js      ← Dr. Ada Vance TUI
    ├── tui_kael_vector.js    ← Kael Vector TUI
    ├── tools/
    │   ├── web.js            ← DDG, Wikipedia, RSS
    │   ├── books.js          ← Gutenberg, Internet Archive
    │   ├── market.js         ← crypto, stocks, fear&greed
    │   └── news.js           ← news aggregation
    └── data/
        ├── knowledge.db           ← Izuku: 40q/10k
        ├── mahina_knowledge.db    ← Mahina: 27q/10k
        ├── muhan_knowledge.db     ← Muhan
        ├── plastos_knowledge.db   ← Plastos
        ├── monk_knowledge.db      ← Monk Maecenas: 20q/20k
        ├── rishad_knowledge.db    ← Prince Rishad: 24q/20k
        ├── turing_knowledge.db    ← Turing Voss: 50k/15puzzles
        ├── sable_knowledge.db     ← Sable Chen: 40k/12postmortems
        ├── ada_knowledge.db       ← Dr. Ada Vance: 20k/5theorems
        └── kael_knowledge.db      ← Kael Vector: 20k/10models
```

---

## How to Run

```bash
# Terminal 1 — start shared server
cd /home/sword/Documents/Characters/freellmapi
npx tsx server/src/index.ts

# Terminal 2 — any character
cd /home/sword/Documents/Characters/character-flow

# Original characters
npm run izuku        # Hero philosopher
npm run mahina       # Strategist
npm run muhan        # Math professor / trader
npm run plastos      # War reporter

# New characters (Sep 14)
npm run monk         # Religious scholar (story-first teaching)
npm run rishad       # Manga/novel comedy lover
npm run turing       # Logic puzzle master & algorithm designer
npm run sable        # Pragmatic full-stack engineer
npm run ada          # Computational mathematician
npm run kael         # ML engineer & model architect

# Seed any character DB
node brain/seed_monk.js
node brain/seed_prince.js
node brain/seed_turing.js
node brain/seed_sable.js
node brain/seed_ada.js
node brain/seed_kael.js
npm run seed:all     # seed everyone
```

---

## Verified Working
- All 10 characters have brain modules that export SYSTEM_PROMPT + generators
- All 10 seed scripts run successfully, creating populated SQLite databases
- All TUIs start without import errors
- Hybrid RAG returns ranked results from all 3 tiers
- Freellmapi proxy serves completions via ByNara router (agnes-2.5-flash)
- Git committed and pushed to `BayazidHabibSiddikee/character-flow.git`
