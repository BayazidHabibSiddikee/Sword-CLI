# SwordCLI — Limitations Remediation Plan

_Generated 2026-10-02 by a 5-agent team (verification auditor + 4 workstream architects) from the
2026-10-02 rating & comparison scorecard. Every claim below is verified against the live source with
`path:line` evidence. Baseline test suite: **133 pass / 0 fail / 28.7 s** (`node --test test/*.test.js`, exit 0)._

---

## 0. Executive summary

SwordCLI's core is strong and honestly documented (7.6/10 self-score). This plan closes the gaps that
stand between "good lightweight agent" and "trustworthy, extensible, competitive agent", in an order
that fixes correctness first, then the context foundation everything else depends on.

| Phase | Theme | Effort | Depends on |
|---|---|---|---|
| 0 | Correctness fixes (loop guard, atomic write, web mount) | S | — |
| 1 | Context budget + honest degradation + session diff | M | — |
| 2 | Execution engine (parallel tools, batched edits, sandbox) | L | Phase 1 |
| 3 | Provider resilience + capability-loss + cost accounting | M | Phase 1 |
| 4 | Ecosystem: MCP client in CLI, skills, team state | M | Phase 2 |
| 5 | Repo hygiene (nested repo, duplicate subsystems) | S | — |

> Ordering rationale: Phase 0 first because a misfiring loop guard corrupts the safety story the
> scorecard rates 9/10. Phase 1 before Phase 2 because parallel tool output multiplies context
> pressure. Phase 3 before Phase 4 because MCP tools enlarge the failure surface the breaker contains.

---

## 1. Verified current state (what the scorecard got right, wrong, and missed)

Of 25 scorecard items: **21 CONFIRMED**, **4 PARTLY/WRONG**, 1 unverifiable (g4f runtime reliability).

### Corrections to the scorecard

| # | Scorecard says | Actual | Evidence |
|---|---|---|---|
| 1 | Loop detection is 3-tier (3/5 repeats) | **1 effective tier.** `hard = seen>=3; soft = seen>=5; if (hard \|\| soft)` — `soft` is unreachable (`seen>=5 ⟹ seen>=3`). Counter increments **before execution and regardless of success**, so 3 identical *successful* calls trip a "it keeps failing" hard-stop. Hard-stop answers **every** call id, incl. already-answered ones → duplicate `tool_call_id`. | `cli/agent.js:119,164-181` |
| 2 | `read_file` 2 MiB cap | 2 MiB applies **only to ranged reads**; whole-file reads are capped at **64 KB** (`LIMIT`). | `cli/tools.js:10-11,105-115` |
| 3 | `write_file` atomic `wx` | `wx` only on **create**; overwrite uses `flag:'w'` with **no temp+rename** → not atomic. | `cli/tools.js:176` |
| 4 | top-level `web/` stale/broken | Correct, **and worse**: `package.json:36` `"flow:web": "npm run dev --prefix web"` still **launches the dead copy**. The real launcher (`sword.mjs:30,173-192`) serves `swordcli/client` on :3002. `web/` has no vite config → wrong port (:5173) and no `/api`+`/v1` proxy. | `package.json:36`; `sword.mjs:30,173-192` |

### Confirmed strengths — do NOT regress

Approval grants `y/a/A/N` with deny-overrides-allow (non-terminal ALLOW); the verbatim rejection suffix
("Action denied by user. NOT a tool or system failure…"); prompt-injection scan on skills; git rollback
under `refs/flow/checkpoints/*` with index backup and refusal during merge/rebase/bisect; hybrid
BM25+TF-IDF+FTS5 RAG; shared backend sessions; SSE tool-call reassembly; `/knowledge` nav.

### Blind spots not in the scorecard

- **H — Nested duplicate git repo.** `character-flow/.git` exists (713 tracked files) beside the root
  repo, plus untracked `character-flow/character-flow/`. Causes drift and doubled search hits.
- **H — A documented script ships the dead UI** (`npm run flow:web`, above).
- **M — Duplicate subsystems:** two RAG engines (`cli/brain/rag.js` vs `swordcli/server/src/services/rag.ts`)
  and two skill surfaces (`cli/skills/` vs root `skills/`); the scorecard treats each as one.
- **M — Skill index is a cliff:** only **24 of 177** discovered skills fit the 4096-char budget, and they
  are an arbitrary alphabetical prefix (`cli/externalSkills.js:127,135`).

---

## 2. Boundary analysis — invariants that must not change

Any fix must be additive and preserve these, or explicitly version/migrate.

1. **Public CLI flags:** `--cwd --prompt/-p --json --session --local --shared --shared-session --import-session --mode --model --team` (`cli/flow.js:103-137`).
2. **Session file format:** `.flow/<name>.json` = `{cwd, messages:[…]}`, name `^[A-Za-z0-9_-]{1,64}$`, 1 MiB cap, mode 0600, symlink-refused, atomic temp+rename (`cli/agent.js:232-256`). Budget/degradation must be **request-local** so the persisted log is untouched; added metadata must be optional.
3. **Checkpoint layout:** `refs/flow/checkpoints/<id>`, KEEP=20, `read-tree --reset -u`, index backup/restore, gitignored files never deleted, refuse mid-operation (`cli/checkpoint.js:20-21,51-60,143-185`).
4. **Approval semantics:** deny before allow; ALLOW non-terminal; keep the rejection-suffix string verbatim; checkpoint only **after** approval (`cli/tools.js:74-81,128-145`).
5. **Tool contract:** the 11 built-in definitions plus non-model `run.checkpoint` (`cli/tools.js:23-35,288-307`); MCP tools must be **inert and add zero entries** when no config exists.
6. **Degraded contract:** `[Degraded] …CHAT-ONLY…` notice + `{"degraded":true,"toolsUsed":false}` in `--json` (`cli/providerFallback.js:40-46`, `cli/flow.js:440-442`). Change *when* it fires, not its shape.
7. **Launcher ports:** API :3001, web :3002, sword-server :3101 (`sword.mjs:26-35`).
8. **Immutability contract:** `cli.test.js` asserts input history is not mutated — all history edits return new arrays.

**Coupling risks:** budget must not break shared-session persistence (`flow.js:390-391`); parallel execution
must not change loop-detection keying (`agent.js:121-125`) or the once-per-step mistake guard; provider
retries wrap **only** the HTTP call (never tool execution); the circuit breaker must not block a deliberate
user retry after `/clear` or a provider switch.

---

## 3. Proposed interfaces (new modules, exact signatures)

### A. Execution engine — `cli/executor.js`, `cli/batch.js`, `cli/sandbox.js`

```js
// cli/executor.js
export function prepareCalls(calls, repeats, limits)                 // pure: validate + bump loop counters in index order
export function partitionCalls(calls, { isMutating, batchable })     // -> [{kind:'readonly'|'mutate'|'batch', calls}]
export async function runReadonly(calls, { run, signal, onEvent, maxParallel = 4 })
export async function runMutation(calls, { run, batch, signal, onEvent })
export function foldResults(history, outcomes)                       // -> new history: ONE tool msg per outcome, ascending index
// cli/batch.js
export async function changeMany(name, items, deps)                  // validate all -> ONE permit (combined diff) -> temp+rename per file
// cli/sandbox.js
export async function detect({ env, platform })                      // -> { kind:'bwrap'|'firejail'|'none', reason }  (cached)
export function buildArgv({ kind, cwd, command, args, network='deny', writable })  // pure
export function describe(capability, { writable, network })          // -> { mode, network, writable, notice }
```

- **Parallel calls** run only read-only tools concurrently; mutating tools stay serialized and in order.
- **Invariants preserved:** exactly one tool-result per `tool_call_id` in **original order**; ONE checkpoint per turn (taken before first mutation); deny-overrides-allow; Ctrl-C mid-batch keeps completed reads and repairs the rest via `checkpointRepair`.
- **Sandbox** is optional and degrade-graceful: `bwrap` → `firejail` → `none`. `command()` result gains an additive `sandbox` field; an ENOENT downgrade is explicit (`sandboxDowngrade:true`), never silent. It guarantees writes outside `<cwd>`/`/tmp` fail and (default) no network; it does **not** guarantee read isolation or protection when no sandbox exists.

### B. Context & memory — `cli/budget.js`, `cli/sessionDiff.js`, archiver additions

```js
// cli/budget.js (pure, no dependency)
export const CHARS_PER_TOKEN = 4;
export function estimateTokens(text)                                  // Math.ceil(len / 4)
export function classifyMessage(m)                                    // system|user|assistant_text|assistant_tool_use|tool_result
export function projectRequest({ messages, tools })                   // { tokens, blocks, reserve }
export function degrade({ messages, tools, budgetTokens })            // { messages, degraded, events, projected }
// cli/sessionDiff.js
export async function sessionDiff({ cwd, snapshot, history, archivedCount, maxItems = 8 })
export function formatSessionDiff(diff)                               // '' when unavailable
```

- **Never-orphan invariant:** history degrades to a placeholder (whole oldest turns dropped first, then oversized `tool_result` shrunk) while **the current input never degrades**, and a `tool_use` is never separated from its `tool_result`.
- The literal `'Context limit reached…'` string is kept only for the irreducible case (system + tools + current input alone exceed budget).
- **Session diff** reuses `checkpoint.changedSince` + git refs, so it stays correct even after history was archived into RAG.

### C. Ecosystem — MCP, skills, team

- **Dependency verdict:** `@modelcontextprotocol/sdk` is **not reachable** from `cli/` today (only `swordcli/node_modules`). Add `^1.30.0` to root deps and import it **lazily only when a config exists** → zero-cost default preserved.
- `cli/mcpConfig.js` (search `.sword/mcp.json` then `~/.config/sword/mcp.json`; `expandSecrets`; `redactConfig`; accept `mcpServers` map as alias for `servers`).
- `cli/mcp/` dispatch: names `mcp__<server>__<tool>` (sanitised, collision-suffixed, cannot shadow builtins); **every** MCP call goes through `permit()` (default require-approval; `allow-all` does **not** cover `mcp__` unless the server was explicitly granted); per-call timeout; dead server → `ok:false` and dropped from the next catalog.
- `cli/skills/store.js`: `installSkill`/`uninstallSkill`/`verifySkills` with `.sword/skills/<name>/SKILL.md` + sha256 lockfile + git provenance; ranked index selection (replacing the alphabetical prefix that shows only 24 of 177).
- **Team:** one module adding `aggregateVotes` + `deliberate()` (optional `--team-rounds 2`, default off) and surfacing team state to `/status` and shared-session metadata (additive column).

### D. Resilience + observability + UI

```js
// cli/providerRetry.js
export function classifyError(err)   // { kind:'transient'|'rate_limited'|'auth'|'capability'|'model_missing'|'fatal', status?, retryAfterMs? }
export function computeBackoff(attempt, { baseMs=500, capMs=15000, jitter=0.5, retryAfterMs })
export async function withRetry(fn, { attempts=4, signal, onRetry, classify, sleep })
export class CircuitBreaker { constructor({ failureThreshold=5, cooldownMs=30000 }) /* .allow/.onSuccess/.onFailure/.snapshot */ }
// cli/capability.js -> structured capability_lost event (not prose-as-answer); persist the user's turn on pure provider failure
// cli/usage.js     -> createUsageTracker(); append .flow/usage.jsonl (0600); surface in /status and /usage
```

Mirrors the server's existing `proxy.ts:314-356` (`isRetryableError`) and `ratelimit.ts:284-346` (cooldown
ladder) instead of reinventing them. **Privacy:** nothing leaves the machine; no telemetry.
**UI:** delete dead `./web/` and repoint `flow:web` to `swordcli/client`; add an archive/context indicator
(`GET /api/rag/stats`) and an **opt-in** skills listing (`GET /api/skills`, `SkillsPage` gated by
`localStorage.swordcli_show_skills === '1'`). Nav already includes `/knowledge`.

---

## 4. Sequenced roadmap

### Phase 0 — Correctness fixes (S)
- Repair loop detection to a real 3-tier guard; do not count successes as failures; emit exactly one result per `tool_call_id` on hard-stop (`cli/agent.js:164-181`).
- Make `write_file` truly atomic (temp+rename) on overwrite (`cli/tools.js:176`).
- Reconcile `read_file` docs with behaviour (64 KB whole vs 2 MiB ranged).
- Repoint `flow:web` → `swordcli/client`; delete dead `./web/`.
- **Acceptance:** new `test/loop-detection.test.js`, `test/tools-atomic-write.test.js` green; 133 existing green.

### Phase 1 — Context budget + honest degradation + session diff (M)
`cli/budget.js`, never-orphan degradation, turn-boundary archive split + persisted placeholder, `cli/sessionDiff.js`.
- **Acceptance:** degrade never orphans a tool pair and never touches the current input; `/status` shows the token budget; the archiver never splits a tool pair; resume after archive is honest.

### Phase 2 — Execution engine (L)
Parallel read-only execution, batched multi-file edit with one approval + combined diff, optional sandbox.
- **Acceptance:** one result per id in original order; one checkpoint per turn; deny-overrides-allow unchanged; sandbox mode declared in every `run_command` result.

### Phase 3 — Provider resilience + capability-loss + cost (M)
`providerRetry.js`, `capability.js`, `usage.js`.
- **Acceptance:** 429/5xx retried with backoff+jitter; 401 never retried; g4f 526 circuit-broken; fallback prose never presented as a completed answer; retries never double-execute tools.

### Phase 4 — Ecosystem: MCP + skills + team (M)
- **Acceptance:** no MCP config ⇒ SDK never imported and tool list unchanged; every MCP tool requires approval; a tampered skill is excluded by the lockfile.

### Phase 5 — Repo hygiene (S)
- Resolve the nested `character-flow/.git` + untracked `character-flow/character-flow/`; guard against silent drift between the two RAG engines and two skill surfaces; refresh `README.md:214,216-228`.

### Global acceptance gate (every phase)
`node --test test/*.test.js` green (baseline 133) · server `npx tsc --noEmit` + vitest green · no invariant
in §2 changed.

---

## 5. What this plan does NOT do (explicit non-goals)

- No marketplace/registry service or PKI signing — install integrity stops at git-rev + sha256.
- No agent-to-agent messaging platform; team improvements are one module, not an orchestrator.
- No tokenizer dependency; the budget uses a documented `chars/4` heuristic with a safety margin.
- No network sandbox guarantee on platforms without `bwrap`/`firejail` — only an explicit declaration.
- LSP/AST-aware editing, remote/SSH editing, and a Cline-style patch-fuzz mode remain out of scope
  (the last is a legacy-model compatibility tax per `docs/COMPARISON.md`).

---

## Appendix — Evidence index

| Claim | Evidence |
|---|---|
| Test baseline 133/0 | `node --test test/*.test.js` → `tests 133, pass 133, fail 0, EXIT=0` |
| Loop-guard bug | `cli/agent.js:119,164-181` |
| Non-atomic overwrite | `cli/tools.js:176` |
| Whole-file 64 KB cap | `cli/tools.js:10-11,105-115` |
| Context cliff | `cli/agent.js:28` |
| Archive threshold + interaction | `cli/historyArchive.js:31,99-103`; `cli/flow.js:200,401-410` |
| Dead `web/` still launched | `package.json:36`; `sword.mjs:30,173-192` |
| MCP unreachable from CLI | `swordcli/server/src/agent/mcp-client.ts:19-21`; root `package.json` deps |
| Skill index cliff (24/177) | `cli/externalSkills.js:127,135` |
| Fallback prose-as-answer | `cli/providerFallback.js:105-152`; `cli/flow.js:440-444` |
| Nested repo | `git -C character-flow rev-parse --is-inside-work-tree` → true; root `git status` → `?? character-flow/character-flow/` |




