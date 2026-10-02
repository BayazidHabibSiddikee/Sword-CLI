# SwordCLI vs. cline / OpenBot / LLM_Techniques

Comparison date: 2026-10-02. Sources read directly:
`~/.npm-global/lib/node_modules/cline` (v3.0.67), `OpenBot/` (CopilotKit openbot),
`/home/sword/Documents/LLM_Techniques`.

Goal: find ideas worth porting into SwordCLI's CLI agent. Not a full merge — each
source is a different shape of system and most of it is not portable.

---

## 1. What each source actually is

| Source | Shape | Readable? | Portable surface |
|---|---|---|---|
| **cline** | 398MB npm install. Bun-compiled ELF binary; impl. minified; 326 hand-authored `.d.ts` | Types + string literals only. 82 `.d.ts.map` have **no `sourcesContent`** — a dead end | High: contracts, defaults, prompts, tool set |
| **OpenBot** | Self-hostable agent platform, ~15 framework adapters (`agent-langgraph`, `agent-claude-sdk`, …), AG-UI, browser "coworkers" | Yes | Medium: governance model |
| **LLM_Techniques** | 1,878-file course repo. `ipynb=0`, but `agno` imported **346×**, `streamlit` **126×** | Yes | Low: exactly one file is dependency-light |

**Honest headline:** cline and OpenBot each contain ~5 genuinely good ideas.
LLM_Techniques is ~93% tutorial; it contributes 2.

---

## 2. The three sources agree on one thing

All three independently flag the same weakness, and it is the same weakness:

- **OpenBot:** "SwordCLI does not lack a prompt. It lacks a *policy layer above a
  well-built one*." Its `callTool` is a 5-stage chain — capability grant →
  contextual policy → classification → shadow mode → decision record.
- **LLM_Techniques** (`ai_agent_governance.py:215-380`): framework-free policy engine
  where **`ALLOW` is deliberately non-terminal** — it keeps evaluating so a later
  DENY/REQUIRE_APPROVAL can override. Plus an append-only audit log.
- **cline:** models *user rejection* as a distinct outcome from tool failure, with a
  fixed suffix so the model can't retry a deliberate "no" as if it were a bug.

SwordCLI's `permit()` (`cli/tools.js:77`) is genuinely well built — `structuredClone`
snapshot, `throwIfAborted()` on both sides, staleness re-checks, atomic `wx` create.
What it lacks is anything *above* it. That is the highest-value gap.

---

## 3. Where SwordCLI actually stands

Verified, with evidence — not a wishlist.

**Already good (do not regress):**
- Path validation (`tools.js:39-53`): traversal, canonical `realpath`, per-component
  symlink rejection, blocklist on every segment, re-validated after approval.
- Approval race-safety: `structuredClone` + `throwIfAborted()` on both sides of the prompt.
- SSE reassembly (`agent.js:54-102`): fragments tool-call deltas by index, non-trivial
  and correct. Falls back to buffered when a provider ignores `stream`.
- `checkpointRepair()` (`agent.js:155`): back-fills `{"error":"aborted"}` so history
  stays API-valid after Ctrl-C.
- Hybrid RAG (`brain/rag.js`): BM25 + TF-IDF cosine + FTS5, weighted 0.4/0.35/0.25.

**The gaps, ranked:**

| # | Gap | Evidence | Cost to fix |
|---|---|---|---|
| 1 | **No persistent approval grants.** Every mutating call is a fresh bare `y`. No allowlist, no per-tool grant, no session scope. Non-interactive (`--prompt`/`--json`) ⇒ `if (!rl) return false` ⇒ *all writes silently denied* | `flow.js:216-223`, `tools.js:77-81` | S |
| 2 | **Cannot read large files at all.** Hard refusal >64KB, no `offset`/`limit` params anywhere | `tools.js:6,56`; `grep offset\|range` → 0 hits | S |
| 3 | **Approval shows no diff.** `write_file` shows byte count; `edit_file` shows only a `+N −M` line delta. You approve a change you cannot inspect | `ui.js:46-56` | S |
| 4 | **Provider failure silently degrades a coding session into a chat-only one.** `attemptFallback` strips `tool_calls`, has no tools, and its "Offline Mode" prose is printed *as the assistant's answer*. No retry, no backoff, no warning | `flow.js:369-378`, `providerFallback.js:88-91,147` | S |
| 5 | **No loop guard.** A model retrying the same failing tool burns all 20 steps, then the step-limit throw is converted into a g4f free-text answer — losing all 20 steps of work | `agent.js:106-152` | S |
| 6 | **No rollback.** `snapshots` holds exact pre-edit content and is used *only* for staleness checks. `grep -i rollback` → 0 hits | `tools.js:38,87` | M |
| 7 | **Three dead features, all silent.** `/tasks` advertised in help with no handler; `--team` imports `brain/izuku.js` (actual: `brain/tui_izuku.js`) inside `catch {}`; `save_to_rag` writes `.flow/rag.db` while the agent reads `cli/brain/rag.db` — **two different databases** | `flow.js:537`, `:265,:284`, `tools.js:114` vs `flow.js:26` | S |
| 8 | No parallel tool calls (strictly sequential); no MCP in the CLI (server harness has a full client); context is a 500KB cliff, not a budget | `agent.js:119`; `agent.js:17` | M |

---

## 4. Ported in this change

Gaps 1–5 and 7. All S, all covered by tests.

| Idea | From | Where |
|---|---|---|
| Session-scoped approval grants (per-tool + allow-all), honoured non-interactively only when explicitly granted | OpenBot grants + LLM_Techniques policy chain | `cli/tools.js` |
| Deny-overrides-allow with **non-terminal ALLOW** | `ai_agent_governance.py:242-270` | `cli/tools.js` |
| Real unified diff in the approval prompt (capped) | cline `editor` diff | `cli/ui.js` |
| Ambiguity is a hard error; EOL-normalise both sides before matching | cline `qB()` | `cli/tools.js` |
| Rejection is a distinct outcome, not a failure | cline `TOOL_REJECTION_SUFFIX` | `cli/tools.js` |
| 3-tier loop detection on a hash of (tool, input) — `ok`/`soft`/`hard` at 3/5 | cline `loop-detection` | `cli/agent.js` |
| Consecutive-mistake guard with recovery guidance | cline `mistake-tracker` | `cli/agent.js` |
| `read_file` `offset`/`limit` + raised cap | fills gap 2 | `cli/tools.js` |
| Declared degraded mode instead of silent prose | fills gap 4 | `cli/flow.js` |
| Fix the 3 dead features | fills gap 7 | `cli/flow.js`, `cli/tools.js` |

## 5. Deliberately NOT ported

- **cline checkpointing** (`git stash push --include-untracked` → private ref →
  drop from stash list, with a persistent `GIT_INDEX_FILE`). Genuinely good and the
  best remaining idea, but M-effort with real git edge cases. Queued.
- **cline `apply_patch`** with `@@` context hunks and fuzz tolerance. The explorer was
  right that fuzz is a legacy-model compatibility tax, not a design win — if adopted,
  context matching should be strict.
- **cline budget-projection** (typed block classification, never orphaning a
  `tool_use` from its `tool_result`). Excellent, but only pays off once the provider
  layer is structured. Queued behind checkpointing.
- **OpenBot's budget asymmetry** — *"history degrades to a placeholder; the current
  input refuses."* Correct invariant, no budget layer to apply it to yet. Recorded so
  it is right the first time.
- **LLM_Techniques signed feature hashing** (`rag.py:190-216`) — zero-dep lexical
  embedding, ~30 lines. Useful as an extra RAG lane, but SwordCLI's BM25 already
  covers the lexical case and the semantic quality would be poor.
- **LLM_Techniques skill scanner** (`skill_scanner.py`, 423 lines) — only if
  third-party skill loading is ever added.
- **Everything else** in all three: cline's hub/daemon/telemetry/VSCode coupling and
  multi-agent teams; OpenBot's 15 framework adapters; LLM_Techniques' agno/streamlit
  monoculture and all LangChain wrappers.