# Gain — What We Learned & Decided

_Session date: 2025-09-13_

---

## Discoveries

### 1. character-flow GitHub repo is empty
The target repo `BayazidHabibSiddikee/character-flow` cloned successfully but contains no commits.
→ Decision: treat it as a fresh canvas; scaffold everything from scratch inside it.

### 2. freellmapi is feature-heavy
- 6 client pages (Models/Fallback, Playground, Keys, Embeddings, Analytics, Premium)
- 16 server routes including debate simulator, business module, premium, embeddings
- ~800 lines in `server/src/app.ts` mounting routers
→ Decision: strip to 2 pages (Keys + Usage) and 5 routes (keys, proxy, models, health, usage)

### 3. Marin already has the character logic we need
`utils/persona.py` has Marin's dual persona system (good/evil). We're building a third persona: Izuku.
→ Decision: extract the concept (get_character_prompt, vibe analysis) but write a new prompt from scratch for Izuku.

### 4. RAG is already wired in marin
`rag_server.py` serves FAISS+LangChain on port 5080. `utils/agent_logic.py` calls it via HTTP.
→ Decision: character-flow's brain will have its own lightweight BM25 (no vector model needed) + optional FAISS if books are uploaded.

### 5. Tools directory has standalone scripts
`crypto.py`, `stock.py`, `news_harvester.py`, `knowledge_hub.py` etc. are self-contained.
→ Decision: character-flow TUI will call these as subprocesses when needed, same pattern as marin.

---

## Design Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Brain language | JavaScript (Node) | freellmapi is TS/Node; TUI is React; keeping it unified |
| Storage | SQLite (primary) + PG (optional) | Zero-config, portable; PG for production scaling |
| BM25 implementation | Pure JS, no external libs | Matches marin's Python version exactly |
| TUI framework | Ink (React for terminal) | Consistent with freellmapi client stack; faster iteration |
| Character persona | Izuku Midoriya × Multi-Laws Wisdom | Fusion of analytical hero + universal law collector |
| Quote generation | Template + law-matching | Deterministic, no LLM dependency for basic output |
| Poetry generation | Law-aware template | Each stanza references a real universal law |
| Business ideas | Law-grounded templates | Every idea cites which law enables it |
| freellmapi slimming | Keep only keys + usage + proxy | Reduces attack surface, startup time, mental load |
| Repo location | `/home/sword/Documents/Characters/` | Clean separation from marin and tools projects |

---

## Files Created This Session

1. `/home/sword/Documents/projects/marin/utils/izuku_character.py` — Python character module
2. `/home/sword/Documents/Characters/docs/mission_plan.md` — this plan
3. `/home/sword/Documents/Characters/docs/current_state.md` — progress tracker
4. `/home/sword/Documents/Characters/docs/gain.md` — this file

---

## What Comes Next (Priority Order)

1. **Copy & slim freellmapi** — biggest infrastructure win
2. **Port brain to JS** — enables standalone character-flow
3. **Build TUI prototype** — proves the end-to-end flow
4. **Seed the database** — populates the character with personality
5. **Integration test** — TUI → freellmapi → brain → response

---

## Notes for Future Sessions

- The Python `izuku_character.py` in marin is a reference implementation. The JS port should match its behavior exactly.
- freellmapi-minimal should still support the full OpenAI-compatible `/v1/chat` proxy — the character brain is an overlay, not a replacement.
- The TUI command palette (`/quote`, `/poem`, `/idea`) should call character-specific endpoints, not the general proxy.
- Keep `docs/gain.md` updated every session — it's the institutional memory.
- **Custom providers**: freellmapi supports custom OpenAI-compatible providers via `POST /api/keys/custom`. ByNara Router (`https://router.bynara.id/v1`) is saved as fallback with model `agnes-2.5-flash` (key: `sk-nry-...OIhQ`).
- **Knowledge base**: Drop PDF/DOCX/TXT/MD files into `character-flow/data/documents/` or upload via `/api/kb/upload` — they're chunked and indexed into the shared RAG engine automatically.
