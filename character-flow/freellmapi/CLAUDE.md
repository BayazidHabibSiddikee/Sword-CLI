# CLAUDE.md — agent guidance for this repository

**Project shape:** this is a **single-maintainer project built by combining
other projects** — a FreeLLMAPI base merged with AI_Debate and agentic-os
pieces into one product. It is NOT an open-source fork to contribute back to:
never file PRs upstream or treat `tashfeenahmed/freellmapi` as a target.

FreeLLMAPI itself: Express 5 + TypeScript ESM monorepo (`shared`, `server`,
`client` npm workspaces) with a React/Vite client. The Business module adds an
AI-team layer with a hybrid BM25 + embedding RAG knowledge library.

## Commands

```bash
npm install                      # workspaces install (root)
npm run dev                      # server (:3001) + client concurrently
cd server && npx tsc --noEmit    # typecheck (CI gates on build = tsc)
cd server && npx vitest run --pool=forks --fileParallelism=false   # all tests
cd server && npx vitest run src/__tests__/services/rag.test.ts     # one file
npm run build                    # tsc + client build
```

CI (`.github/workflows/ci.yml`): install → `npm test` → `npm run build`.
Run both locally before declaring done.

## Conventions

- ESM everywhere: relative imports in `server/src` end with `.js`.
- Response envelope: use `sendOk` / `sendError` from `server/src/lib/envelope.ts`
  for Business/agent-facing routes (contract in `docs/agent-harness.md`).
- Tests live in `server/src/__tests__/**`, run under vitest, globals enabled.
- Data directories: repo-root `data/` (characters, library, debate sessions);
  `server/data/` is local-only runtime state.

## Secrets — read before ANY commit

NEVER stage or commit:

- `server/data/` — contains `freeapi.db` (encrypted API keys)
- `decrypt.js`, `update_hermes.js` — contain a hardcoded AES-256 key
- `.env`, `*.db`, `*.db-wal`, `*.db-shm`, `pids/`, `logs/`

All are gitignored; verify with `git status --short` before committing and
confirm none of the above appear.

## SwordCLI — shared sessions, memory and the web UI

SwordCLI is the agent surface layered on this proxy. It is **local single-user**:
keep the process bound to loopback (`HOST=127.0.0.1`), because legacy `/api/*`
admin routes (including unified-key retrieval) remain unauthenticated.

- `server/src/routes/sword.ts` — `/api/sword/*`, authenticated with the unified
  API key (timing-safe compare) and rate-limited. It stores chat history in the
  shared sessions table and **never executes tools**: web chat is text-only.
  `server/src/services/sword-memory.ts` owns storage, optimistic revisions and
  SQLite FTS5 retrieval (lexical, not embeddings).
- CLI side lives in the parent repo: `character-flow/character-flow/cli/`.
  `--shared` sessions (the default for `npm run sword`) are visible on the web.
  File edits and commands stay approval-gated in the terminal.
- Memory is injected as a **system** message inside `<workspace-memory>` tags and
  is explicitly untrusted. Never inject retrieved history as a `user` turn: a
  leftover prompt stored in an old session once hijacked a later turn.
- Model choice: `--model` → `SWORD_MODEL` → strongest advertised model → `auto`.
  The default `balanced` routing strategy serves weak models
  (`gemini-3.5-flash-lite`, `glm-4.7-flash`), which produced broken code, so the
  CLI prefers a rank-2 model when one is available.
- `POST /v1/responses` was deleted in `637deb2` ("slim to keys/proxy/health")
  while the README still advertised it; it is restored and mounted in `app.ts`.
  Its tests came back from `b114f2f^`. Do not remove it without updating both
  the README and `client/src/pages/KeysPage.tsx`.

## Push targets

The canonical GitHub home is
`BayazidHabibSiddikee/freellmapi-x-debate-x-agentic-AI` — always push there.
The workspace origin `tashfeenahmed/freellmapi` is the upstream source this
project was built from; it is read-only for you (403 on push) and must never
receive pushes or PRs. Before pushing, fetch that combined repo's `main`
first — it can contain newer work than any local checkout; verify local files
are a superset/additive diff before overwriting anything.

**History layout (as of 2026-09-17):** canonical `main` is NOT an ancestor of
the local `sword-cli` line — it was rebased/reconstructed on a different base
(`6822538`, which `b114f2f..c0734b4` never had) and its tip `969dc8e` contains
work the local line still lacks: `/api/*` admin routes re-gated behind
`requireAuth`, `FREELLMAPI_NO_AUTH` opt-out (`server/src/lib/noAuth.ts`),
`/api/auth` mounting, and removal of the Playground/Embeddings/Premium pages.
Do NOT force-push `main`; the local branch is published as `sword-cli`. To
reunite the lines: `git fetch origin && git merge origin/main` (or rebase)
locally, resolve conflicts in `server/src/app.ts` (responses + sword mounts vs
auth re-gating) and `client/src/App.tsx` (SwordPage route vs page removals),
run the server suite, then fast-forward `main`.
