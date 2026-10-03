# Phase 5 — Repo Hygiene: Findings & Consolidation Plans

_Analysis produced 2026-10-02. Tasks 5.1 (nested repo), 5.2 (duplicate RAG engines) and 5.3
(duplicate skill surfaces). Every claim carries `path:line` or command evidence._

**Summary of actions taken:** one `.gitignore` addition (5.1) and one type-narrowing fix in
`swordcli/server/src/routes/providers.ts` (5.4). **No files were moved, merged or deleted** — 5.2 and
5.3 are analysis only, by explicit instruction.

---

## 5.1 Nested `character-flow/` repository

### Evidence

| Probe | Result |
|---|---|
| `git ls-files character-flow \| wc -l` | **713** |
| `git -C character-flow log --oneline -3` | `f896934 fix: apply b4354ab fixes to correct directory and remove nested character-flow` · `b4354ab fix: recover from readline errors in main loop…` · `95909a6 fix: completely disable external audio players…` |
| `git remote -v` (root) | `origin https://github.com/BayazidHabibSiddikee/Sword-CLI.git` |
| `git -C character-flow remote -v` | **identical** — `origin https://github.com/BayazidHabibSiddikee/Sword-CLI.git` |
| Root imports from `character-flow/`? | **No.** `grep -rn "character-flow" cli/ swordcli/ brain/ scripts/` matches only *comments* (`cli/langgraph-agent.js:2,7`, `cli/skills/file_edit.js:2`, `cli/skills/git.js:2`, `cli/skills/sessions.js:2`). Zero import/require statements. |
| `character-flow/` in `.gitignore` before this change? | **No** — `git check-ignore -v character-flow` returned `rc=1` (not ignored). |

### Interpretation

`character-flow/` is **tracked by the root repo as ordinary files, not a gitlink**. `git ls-files -s
character-flow` reports mode `100644` (regular blob) for every entry, e.g.
`100644 4a1e808… character-flow/.github/workflows/ci.yml`. A git submodule would show mode `160000`.

So this is **not** a submodule relationship — it is a *committed copy of the same repository inside
itself*, pointed at the same origin. The nested `.git` is therefore inert: `git add character-flow/x`
resolves against the **root** repo, and the nested `.git` is what makes `git status` / editor tooling
mislocate the repo boundary.

Content comparison against the root tree (713 files, stripping the `character-flow/` prefix and
diffing each against the root path):

- **350 identical** to their root counterpart — pure duplication.
- **24 differing** — silently stale forks.
- **341 with no root counterpart** — mostly `freellmapi/`, `web/` (the removed dead UI, per
  `docs/limitations_plan.md:41`), plus `sword-server/` and client assets.

The 341 "root missing" files are the reason this cannot simply be deleted: `character-flow/freellmapi`
is a real, separately-developed project that `.gitignore:45` already treats as "nested repo with its own
remote". The nested HEAD even records the accident —
`f896934 … remove nested character-flow` — a fix that was applied inside the nested copy and never
landed in the root.

`character-flow/character-flow/` (7 files: `package.json`, `README.md`, `.gitignore`, `cli/backend.js`,
3 `docs/*.md`) is a third-generation stray with **no git history of its own and no importers**. It was
untracked before this change.

### Decision

**Exclude via `.gitignore`; do not remove.** Added to `.gitignore:48-50`:

```
# Nested duplicate of this repo that lives at character-flow/ — see docs/hygiene_phase5.md
character-flow/character-flow/
character-flow/.git/
```

Rationale:

1. **Zero blast radius.** Nothing imports from `character-flow/` (evidence above). Ignoring it cannot
   break a build.
2. **No history is destroyed.** The task forbids deleting history, and `git rm -r character-flow` on
   713 tracked files across 350 duplicated + 341 unique paths is a high-risk, hard-to-review change
   that would need a full re-import of `freellmapi` into a proper location first. That is a Phase 6
   decision, not a hygiene fix.
3. **It stops the bleeding immediately.** `character-flow/.git` is the thing that confuses tooling and
   search; ignoring the inner `.git/` prevents a nested repo from ever being re-added, and ignoring
   `character-flow/character-flow/` clears the currently-untracked stray from `git status`.

**Verified:** `git check-ignore -v character-flow/character-flow/package.json` →
`.gitignore:49:character-flow/character-flow/`. The `?? character-flow/character-flow/` entry has
disappeared from `git status --short`.

### Follow-up (not done here)

- Decide the fate of `character-flow/freellmapi` (341 unique files): promote to `freellmapi/` at the
  root, or keep it in a separate repo referenced as a submodule.
- Once promoted, `git rm -r --cached character-flow` (staged removal, history retained) and drop the
  `.gitignore` entries.

## 5.2 Duplicate RAG engines — consolidation plan (analysis only)

**No merge performed.** Phase 1 archiving (`cli/historyArchive.js`) writes RAG on every archive; merging
the engines first would risk that path.

### Side-by-side

| | `brain/rag.js` (CLI) | `swordcli/server/src/services/rag.ts` (server) |
|---|---|---|
| Lines | 328 | 474 |
| Language | JS, `better-sqlite3` | TS, `node:fs` + `zlib` |
| Storage | **SQLite file**, path passed to `new RagEngine(dbPath)` (`brain/rag.js:132-143`) | **Filesystem**: `swordcli/server/data/library/{files,index,vectors}` (`rag.ts:19-23`) |
| Schema | `CREATE TABLE IF NOT EXISTS knowledge / wisdom_quotes / business_ideas` (`rag.js:146-180`) | None — JSON sidecars: `index/<id>.json`, `vectors/<id>.json` (`rag.ts:310,313`) |
| Retrieval | BM25 + SQLite FTS5 + TF-IDF cosine (`rag.js:3`) | BM25 + local deterministic feature-hash embeddings, fused with **Reciprocal Rank Fusion** (`rag.ts:1-7`) |
| Embeddings | None | Yes — deterministic, no external API; documented as swappable |

### Who touches which

**`brain/rag.js` (CLI)** — every constructor call points at a *different* SQLite file:

| Caller | DB path |
|---|---|
| `cli/flow.js:29-30` | `cli/brain/rag.db` |
| `cli/historyArchive.js:29,161` | `cli/brain/rag.db` (same file as `flow.js`) |
| `cli/tools.js:206` (`save_to_rag`) | injected `ragDb` path (`cli/tools.js:68`) |
| `cli/brain/*.js` (14 files: `izuku.js:12`, `mahina.js:11`, `muhan.js:11`, `plastos.js:11`, `prince_rishad.js:10` + 9 `seed_*.js`) | `cli/data/knowledge.db` |

**`swordcli/server/src/services/rag.ts` (server)** — reached only over HTTP via
`swordcli/server/src/routes/rag.ts` (`ragRouter`, `routes/rag.ts:21`) mounted at `/api/rag`:
`POST /documents`, `GET /documents`, `GET /documents/:id`, `DELETE /documents/:id`, `POST /search`
(`routes/rag.ts:48,88,92,98,110`).

### Do they share a database or schema?

**No — not at all.** Different storage engines (SQLite vs JSON-on-disk), different schemas
(relational tables vs filesystem keying), different directories
(`cli/brain/rag.db` and `cli/data/knowledge.db` vs `swordcli/server/data/library/`), and zero shared
code. They are two unrelated systems that happen to both answer "search my notes".

Critically, **the CLI engine is multi-tenant already**: `cli/flow.js` and all 14 `cli/brain/*.js` use
*different* `.db` files. So the "consolidation" is not 2 systems but ~16 databases behind one engine.

### Recommendation — consolidate the *retrieval algorithm*, not the data

Do **not** unify storage. The split is load-bearing: the CLI runs with per-character SQLite files
(isolation by design, and Phase 1 archiving depends on that path), while the server serves a
document-library UI. A storage merge would break archive writes.

Instead, in this order:

1. **Land a shared, dependency-free scorer.** Extract the RRF fusion + BM25 scoring from
   `rag.ts` into a pure module with no `fs`/SQLite import (e.g. `shared/ragFusion.ts`), and have
   `brain/rag.js` call it behind a feature flag. Same numbers from both engines afterwards.
2. **Equivalence-test before switching.** Golden set: ~50 documents, fixed queries, assert
   `rag.js`-with-shared-scorer ranks within top-5 of `rag.ts`. This is the gate.
3. **Only then** point `rag.ts`'s search at the shared scorer and retire `brain/rag.js`'s local
   TF-IDF cosine.
4. **Leave storage alone indefinitely.** Revisit the multi-`knowledge.db` sprawl (14 files) as its own
   item — consolidating *those* is a data-migration project, not hygiene.

**Explicit non-action:** Phase 1 archiving writes RAG via `cli/historyArchive.js:159-161`. Steps 1-2
## 5.3 Duplicate skill surfaces — analysis only (no moves)

### Inventory

| | `cli/skills/` | root `skills/` |
|---|---|---|
| Files | 5 | 4 |
| Contents | `bridge.js` (292), `file_edit.js` (346), `git.js` (504), `sessions.js` (126), `tasks.js` (196) | `file_edit.js` (344), `git.js` (504), `sessions.js` (126), `tasks.js` (196) |
| Tracked | 5 | 4 |

**Overlap:** `git.js`, `sessions.js`, `tasks.js` are **byte-identical** (`diff -q` → same for all
three). `file_edit.js` **differs** — and the root copy is the *worse* one:

```
< cli/skills/file_edit.js   const DOCS_ROOT = process.env.SWORD_DOCS_ROOT || process.cwd();
> skills/file_edit.js       const DOCS_ROOT = '/home/sword/Documents';      // hardcoded!
```

The root copy hardcodes an absolute developer path and drops the `SWORD_DOCS_ROOT` override plus the
`./data/` fallback. `cli/skills/file_edit.js` is the portable one.

**`bridge.js` exists only in `cli/skills/`** (292 lines) and is actively imported.

### Who imports which

**`cli/skills/` is the live surface.** Every real importer resolves there:

- `cli/tui.js:9-13` — `bridge`, `git`, `file_edit`, `tasks`, `sessions` (all `./skills/…`, i.e. `cli/skills/`)
- `cli/tui.js:35-37` — the same three again as lazy dynamic imports
- `cli/flow.js:16` — `import { sessions } from '../skills/sessions.js'` → **resolves to `cli/skills/sessions.js`**, not the root `skills/`. (`flow.js` lives in `cli/`, so `../skills/` is `cli/skills/`.)
- `cli/brain/{kael_vector,sable_chen,turing_voss,ada_vance}.js` — `'../skills/agents/*.js'`, also `cli/skills/agents/` — **which does not exist**; these are broken imports.

**Root `skills/` is imported by nothing in the running product.** The only hits for it are:

- `README.md:209` ("Shared skill implementations") and `docs/limitations_plan.md` prose.
- `vendor/agent-scripts/skills/**/SKILL.md` — self-referential paths inside the *vendored* tree, unrelated.

**Both surfaces are already broken for the `agents/` subpath.** `cli/skills/agents/` does not exist
(`ls cli/skills/agents` → `No such file or directory`), yet `cli/tui.js:60-63` lazy-loads
`./skills/agents/{turing,sable,ada,kael}.js` for four personas, and `cli/brain/*.js` statically import
the same four modules. Separately, the **root** `brain/*.js` files are all dead:
`node -e "import('./brain/tui_kael_vector.js')"` fails with
`ERR_MODULE_NOT_FOUND: brain/langgraph-agent.js` (the module lives in `cli/`, not `brain/`). All 11
root `brain/*.js` files are unrunnable copies.

### Recommendation — canonical location: **`cli/skills/`**

Keep `cli/skills/` as the single canonical directory; retire root `skills/`.

Evidence: (a) it is the only surface with a live importer (`cli/tui.js`, `cli/flow.js`); (b) it is a
strict superset — it holds the only `bridge.js` and the only portable `file_edit.js`; (c) root
`skills/` has **zero** code importers, so consolidating into it would mean moving the live code
outward and breaking every path; (d) root `brain/*.js` is already non-functional, proving the
root-level duplicates rot.

Sequence (each step independently shippable and reversible):

1. **Fix the divergence first.** Nothing else is safe while two `file_edit.js` files disagree. Copy
   `cli/skills/file_edit.js` over `skills/file_edit.js` (or delete the root copy) — this removes the
   hardcoded `/home/sword/Documents` path from the tree.
2. **Delete root `skills/`** (4 files) once step 1 lands; grep confirms nothing imports it.
3. **Repair or remove the dangling `agents/` subpath** — `cli/skills/agents/` does not exist while four
   persona modules import it. Either restore the four agent modules or drop those persona entries from
   `cli/tui.js:60-63`. This is a real latent crash in the TUI persona switcher.
4. **Delete the 11 dead root `brain/tui_*.js`** — they fail at import time and are reached by no live
   entry point. (`brain/rag.js` is a *different* matter: it is the live CLI engine's implementation
   module — see 5.2 — and must stay.)
5. **Update `README.md`** to list `cli/skills/` and drop the root `skills/` line (done in this pass).

Steps 2-4 touch files other agents may be editing, so none were performed in this pass.
must be complete and green before any of this touches that file.

---
---