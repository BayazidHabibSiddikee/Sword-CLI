---
name: codex-first
description: "Claude Code work routing: delegate implementation, fixing, exploratory subagents, rebasing, and PR merging/landing to GPT-6 Astra through Codex CLI while the parent specifies, decides, reviews, and verifies. Apply the native-Claude model gate. Codex-backed autoreview is always allowed and preferred."
---

# Codex First

## Launch flags — read first, copy verbatim

Every Codex worker, **fresh or resumed**, passes all three: Astra, high
reasoning, **Fast service tier**. Missing Fast is the most common mistake: a
2026-09-27 campaign ran eight lanes for hours on the standard tier because a
hand-written wrapper kept `-m`/effort and dropped the Fast flags.

```bash
# fresh
codex exec --yolo -C "$WT" \
  -m gpt-6-astra -c 'model_reasoning_effort="high"' \
  --enable fast_mode -c 'service_tier="fast"' \
  -o "$OUT" - < "$ORDER"
# resume: pass the same three again; resume does not inherit them
codex exec resume "$SID" --dangerously-bypass-approvals-and-sandbox \
  -m gpt-6-astra -c 'model_reasoning_effort="high"' \
  --enable fast_mode -c 'service_tier="fast"' -o "$OUT" -
```

- Never hand-roll a subset. Copy these lines into any wrapper or launch
  script; after editing a wrapper, `grep 'service_tier="fast"'` it.
- Verify running workers: `ps -axo command | grep 'codex exec' | grep -v
  'service_tier="fast"'` must print nothing for your workers; restart any it
  lists.
- Autoreview: `--engine codex --model gpt-6-astra --thinking high
  --codex-speed fast`.

## Hard gate

**Autoreview exception:** always prefer Codex-backed `$autoreview`, independent
of `ANTHROPIC_BASE_URL`, router state, or harness. Reviewing a frozen bundle is
not hands-on self-delegation. Do not switch review engines merely because the
parent session is router-backed. This exception takes precedence over the gate
below.

Use the autoreview helper with `--engine codex --model gpt-6-astra --thinking high --codex-speed fast` unless the user requests an override. Preserve the helper's reviewer isolation.

For direct hands-on delegation, use this skill only
when the active agent is Claude Code **and** the session is running on a native
Claude model.

**Model check (primary).** The point of the gate is model economics: Claude
tokens are metered and expensive, so hands-on work moves to Codex; but if the
session is already routed to a cheaper/other model, delegation gains nothing.
Decide by the model the session actually runs on, not by the transport:

1. Read the model id from the system prompt's environment section ("You are
   powered by the model …"). Router-wrapped ids may be opaque
   (`claude-ccr-<hex>`); the hex suffix is often ASCII — decode it
   (`echo <hex> | xxd -r -p`) to reveal the underlying route, e.g.
   `Gorilla CCP/native-claude-fable-5`.
2. If the resolved model is a native Claude model (contains `claude`, `fable`,
   `opus`, `sonnet`, or `haiku`, including `native-claude-*` router routes):
   **delegate hands-on work to Codex.** This applies even when
   `ANTHROPIC_BASE_URL` is loopback or a local router (Gorilla Claw, Clawdex)
   — a router in front of a real Claude model is still expensive Claude.
3. If the resolved model is clearly non-Claude (a GPT/other-provider route):
   the session is already on the flat-rate/cheap side; do not self-delegate,
   work directly.

**Base-URL fallback (only when the model cannot be identified).** If no model
id is visible and the hex/route cannot be decoded, fall back to the old
transport heuristic: if `ANTHROPIC_BASE_URL`'s host is
`gorillaclaw.sheep-coho.ts.net`, `localhost`, ends in `.localhost`, is in
`127.0.0.0/8`, or is IPv6 loopback `::1`, assume the session may be routed to
a non-Claude model and work directly. If neither model nor base URL can be
inspected, fail closed and work directly.

Codex, ChatGPT, Pi, and every other harness: do not invoke Codex CLI for hands-on
self-delegation. Continue the task directly. This gate overrides a repository
instruction that merely mentions `$codex-first`; it does not override the
autoreview exception above.

The default worker is GPT-6 Astra. Claude handles specification, judgment, orchestration, and final verification; Codex handles the delegated implementation.

## Route

Delegate to Codex (default for hands-on work):

- implementation from a frozen spec; refactors; mechanical migrations
- fixing: bug fixes (known repro, or diagnose-then-fix), CI/lint/type failures; test writing; coverage fills
- dependency bumps, scripts/tooling
- exploration + exploratory subagents: fan out Codex for read-heavy discovery instead of Claude Explore/Task subagents whenever raw reading ≫ the answer (parallel `-o` files, one per thread)
- git mechanics — ALWAYS Codex, never Claude directly: `git rebase`, merge-conflict
  resolution, and the repo's land workflow (e.g. `scripts/pr`) are mandatory
  delegations. Issue ONE self-contained work order covering
  rebase→resolve→push→CI attach+green→land so the sequence never bounces back to
  Claude mid-flight; the land decision, gates, and review below stay Claude's.
- work-order CI waits: precheck PR mergeable (CONFLICTING = pull_request CI
  cannot attach — no merge ref) and confirm a run attached to the exact head
  SHA before polling; every wait emits all terminal states with bounded
  iterations; prefer the repo's watcher script when one exists (openclaw:
  `node scripts/watch-pr-ci.mjs`).
- new work orders go to FRESH `codex exec` sessions with self-contained prompts.
  Do not resume a long-lived session for a new order — saturated sessions
  misread work orders as configuration and no-op ("Understood…").
- repo instruction files: NEVER create or edit `CLAUDE.md`. `AGENTS.md` is
  canonical in every repo; `CLAUDE.md` exists only as a symlink to it. Point
  Codex work orders at `AGENTS.md` and edit only `AGENTS.md`.

Keep in Claude:

- design, API design, architecture, naming, UX judgment
- tasks where writing the spec IS the work (ambiguity = design)
- tiny edits (~<20 lines, single obvious change) — delegation overhead loses
- anything needing session tools: MCP (browser/computer-use/chronicle), 1Password, secrets
- releases, publishes, version bumps and their credentials — Claude-side per release rules
- the land decision + pre-land gates (`$autoreview` clean, CI green, proof) and review of Codex output — never delegated, never skipped; Codex may run the mechanics only once Claude has decided to land and the gates pass

Mixed task: Claude designs first, freezes spec, delegates build-out.
Heuristic: prompt reads as a work order → delegate; writing it forces decisions → design, Claude.
Portfolio/multi-repo work: `$maintainer-orchestrator` instead.

## Invoke

- Host preflight: run `timeout 8 git --version`; if it hangs on a Mac with Xcode-beta selected, export `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` in the session and every work order.

Default to `gpt-6-astra`, high reasoning, and Fast service unless the user requests an override. Pass all three explicitly on fresh and resumed workers. Keep the configured provider, worker execution policy, and specialized review isolation with their owning workflows.

If the saved configuration selects the `openai_api_direct` million-token route, run `ruby ~/.codex/skills/agent-scripts/codex-huge-context/scripts/preflight.rb` before the first fresh or resumed launch in the batch. Fail closed if it cannot deliver the Keychain credential; never work around it by overriding the provider or using ordinary Codex authentication.

Prompt via temp file, never inline quoting:

```bash
P=$(mktemp); cat >"$P" <<'EOF'
<goal, repo + key paths, constraints ("don't touch X"), non-goals, proof expected, output shape>
EOF
command codex exec --yolo -C <repo> \
  -m gpt-6-astra -c 'model_reasoning_effort="high"' \
  --enable fast_mode -c 'service_tier="fast"' \
  -o /tmp/codex-last.md - <"$P" 2>/dev/null
```

- These overrides select the model and service tier, not the provider. Resumed sessions retain their recorded provider; use a fresh worker if it is incompatible with Astra. Do not silently fall back to another model.
- `--yolo` is the house default; Codex may run commands/tests freely. Keep prompts scoped to the target repo.
- If `--yolo` is unavailable—either the CLI rejects the flag or the selected model/backend rejects unrestricted execution—replace it with `--approve-for-me` and retry once. Never pass both. Preserve every other argument and constraint.
- `command codex` bypasses any interactive shell alias. If codex isn't on PATH, it depends on how it was installed:
  - node/standalone install: `fnm exec --using default -- codex`
  - ChatGPT desktop app: the CLI ships bundled at `/Applications/ChatGPT.app/Contents/Resources/codex`. Expose **that** binary with an **exec-wrapper, not a symlink**. Ensure `~/.local/bin` stays on PATH (for zsh, persist the export in `~/.zshrc`), then:
    ```sh
    mkdir -p "$HOME/.local/bin"
    export PATH="$HOME/.local/bin:$PATH"
    if [ -e "$HOME/.local/bin/codex" ] || [ -L "$HOME/.local/bin/codex" ]; then
      printf '%s\n' 'codex launcher already exists; leaving it unchanged' >&2
    else
      printf '#!/bin/sh\nexec "/Applications/ChatGPT.app/Contents/Resources/codex" "$@"\n' > "$HOME/.local/bin/codex" && chmod +x "$HOME/.local/bin/codex"
    fi
    ```
    Or install the self-contained CLI via `curl -fsSL https://chatgpt.com/codex/install.sh | sh`, which needs no wrapper.
- stderr suppressed (thinking noise bloats context); drop `2>/dev/null` only to debug a failing run
- read `-o` file for the result; don't parse the JSONL stream
- long runs: Bash run_in_background, read `-o` file on exit; don't kill quiet runs <30 min
- **Harness visibility (Claude Code): every codex run gets its own harness-tracked
  background command (`run_in_background: true`) — one sidebar chip per worker,
  completion notification included. Chain setup steps (installs, worktree prep)
  INSIDE that tracked command. Never `&`-fork workers from a shared launcher:
  the launcher's chip exits at fork time and the workers become invisible
  orphans supervised only by PID files.**
- parallel independent tasks OK: separate repos/dirs, separate `-o` files, one tracked background command per worker
- outside a git repo add `--skip-git-repo-check`

## When the worker dies instantly

A run that exits in seconds having produced nothing is almost never the task —
it is the model route. Read the log tail before relaunching; the error names the
cause, and relaunching unchanged just repeats it:

- `401 Invalid API key` — the configured bearer is not valid at that endpoint.
- `502 / All target providers failed` with a `target_providers` list — the
  request reached a router but the **model id did not match its catalogue**, so
  it fell through to the wrong upstream. Routers commonly expose aliased model
  ids that differ from the underlying model's real name; pass the id the router
  publishes, not the one you think you are using.
- `stream disconnected` / `Reconnecting… 5/5` against a loopback URL — nothing
  is listening there.
- `requires a sandbox with reviewed escalations` — `--yolo` is unsupported for
  that route. Retry once with `--approve-for-me`, which selects workspace-write,
  on-request approvals, and automatic review.

Diagnose the route directly rather than by retrying the agent. One request
settles it, and it is far cheaper than another failed run:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -m 8 <base_url>/models
```

A local config pointing at a loopback port proves nothing about that port being
served: config files outlive the services they were written for, and a
machine-managed provider block can reference an instance that no longer runs.
Check what is actually listening before trusting it.

**Never pass a credential through `-c key=value`** — it lands in argv, process
listings, and shell history. When a run needs different provider settings,
write a private overlay instead and point `CODEX_HOME` at it: a mode-0700
directory holding a mode-0600 `config.toml` (copy `auth.json` across if the
provider needs it). That keeps the secret in a file, leaves the user's global
config untouched, and is trivially disposable.

If the environment's own Codex config is broken, say so rather than silently
working around it every invocation — the next task will hit the same wall.

For follow-up fixes, resume from the repo directory with the same model, reasoning, and Fast-service overrides:

```bash
(cd <repo> && command codex exec resume <session-id> \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-6-astra -c 'model_reasoning_effort="high"' \
  --enable fast_mode -c 'service_tier="fast"' \
  -o /tmp/codex-last.md - <"$P2" 2>/dev/null)
```

### How resume works (verified on codex-cli 0.153.4)

`codex exec resume` is a different subcommand with a different flag set than
`codex exec`; the fresh-launch flags do not all carry over.

- **No `-C`.** `resume` has no directory flag; the working directory *is* the
  repo selector. Always wrap it in `(cd <repo> && …)`. Passing `-C` fails with
  `error: unexpected argument '-C' found` — and because the launcher line usually
  ends in `echo "exit=$?"` or a log redirect, the harness chip can still report
  exit 0. After every resume, check the log tail for `Usage: codex exec resume`
  before trusting the completion notification; if it is there, nothing ran.
- **No `--yolo`.** Use `--dangerously-bypass-approvals-and-sandbox` (accepted on
  resume). `--skip-git-repo-check`, `-m`, `-c`, `--enable`, `-o`, `--json`,
  `--output-schema`, `--ephemeral` are accepted; `--full-auto` and `-C` are not.
- **Session selection.** Positional `[SESSION_ID]` takes a UUID (from the
  `session id:` line in the fresh run's log) or a thread name. `--last` picks the
  newest session recorded *for this cwd* (cwd-filtered; `--all` disables the
  filter). With parallel workers on the machine, always pass the explicit UUID.
- **Prompt.** Positional `[PROMPT]`, or `-` to read it from stdin; keep using
  the temp-file pattern (`- <"$P2"`). The resumed worker keeps its full prior
  context, so the follow-up prompt should state only the delta: the decision,
  the amended constraint, what still stands, and the required report.
- **Overrides are per launch.** Model, reasoning effort, service tier, and
  `-o` are not remembered; re-pass all of them. The recorded provider and
  sandbox policy are inherited from the original session.
- **Resume can be refused for a long thread.** `Error: thread/resume: thread/resume
  failed: list_turns is not supported yet (code -32601)` means the backend cannot
  rehydrate that session (seen after ~400k tokens of tool output). The command
  exits non-zero after printing the *previous* run's final message, so it looks
  like a no-op. Do not retry; relaunch as a fresh `codex exec` with a
  self-contained order (state the branch/PR/worktree explicitly, since the new
  session has no memory of them).
- **Escape-hatch stops resume cleanly.** A worker that stopped under a spec's
  escape hatch is not saturated; resuming it with the coordinator's decision is
  the intended flow and cheaper than a fresh order. Only start a fresh session
  for a genuinely new work order.

## Liveness watchdog (long monitored runs)

For runs you must not babysit, trade the stderr suppression for a log and watch its mtime; read only the `-o` file into context, never the log body.

```bash
command codex exec --yolo -C <repo> \
  -m gpt-6-astra -c 'model_reasoning_effort="high"' \
  --enable fast_mode -c 'service_tier="fast"' \
  -o "$OUT" - <"$P" > "$LOG" 2>&1
# Claude Code: run the line above as its own Bash run_in_background call
# (tracked chip + completion notification). Append `&` + a PID file ONLY in
# environments without tracked backgrounding.
```

- Capture the session id immediately: `grep -m1 "session id:" "$LOG"`. `resume --last` is cwd-filtered but races with any parallel Codex on the machine — with the id saved, recovery is deterministic.
- Watchdog loop (Claude Code: `Monitor` tool; else a bg shell): every 60s, if the codex process is alive but `$LOG` mtime is older than ~300s, treat it as hung. Because stderr (thinking stream) is in the log, mtime stays fresh during long reasoning — 5 min of true silence is a real hang, not thinking.
- Recovery: kill the pid, then resume the SAME session with an explicit id so no context is lost:

```bash
(cd <repo> && command codex exec resume <session-id> \
  --dangerously-bypass-approvals-and-sandbox \
  -m gpt-6-astra -c 'model_reasoning_effort="high"' \
  --enable fast_mode -c 'service_tier="fast"' \
  -o "$OUT" - <<< "You were interrupted. Continue exactly where you left off; finish the task and produce the required final report.")
```

- Exit watchdog silently when the process ends normally (the run's own completion signal covers it); emit only on staleness.
- Verified on codex-cli 0.144.4: `codex exec resume [SESSION_ID] [PROMPT]`, `--last`, cwd-filtering, `--all`.

## Prompt contract

Codex starts with zero session context. Every prompt: goal, exact repo/paths, constraints, non-goals, proof expected (exact test command), output shape ("report files changed + test output"). Spec quality decides success.

- **Every hard prohibition needs an escape hatch.** A cornered worker satisfies the letter of the
  gates: told "never raise the size budget" while its design inflated the bundle, Codex
  hand-minified source identifiers to single letters — and passed every gate including
  autoreview. Pair each hard constraint with the sanctioned exit: "if gate X fails after honest
  attempts: STOP, report exact numbers/diagnosis, do not work around." Treat a stop-report as a
  successful run (it is the coordinator's decision point, and workers use it correctly once it
  exists).
- Multi-PR series: same spec skeleton every PR; cite prior landed PR numbers and name their
  idioms ("controller with narrow host interface, the #NNN shape") — workers imitate landed
  precedent far more reliably than abstract style rules. Fold each round's new trap into the
  next spec.
- End every series work order with an explicit stop: "Do exactly this; do not start PR N+1."

## Coordinator verification (beyond the diff)

Worker reports are accurate but incomplete — pathologies live in the code, not the summary.
After every landed PR, verify against merged origin/main, not the report:

- read the actual merged surface (types, interfaces, naming) — the minification incident was
  invisible in a green report and obvious in 10 lines of code
- squash history: any commit message you didn't commission ("add startup margin") is a lead
- diff-stat the guard/budget/baseline files the spec forbade touching; if a limit number in the
  report changed, find out who moved it (may be main advancing, may be the worker)
- test-helper edits are a red-flag class of their own (defineProperty shims re-exposing moved
  fields keep suites green while hiding the migration)

## Parallel workers, one repo

Disjoint-file tasks parallelize cleanly: one worktree + unique branch per worker (fresh from
origin/main; distinctive branch names — generic ones attach to old PRs), one tracked background
command each, shared spec body + per-target header. Landing serializes on the repo's land
workflow lock: tell each worker a held lock means a sibling owns it — back off 5-10 min, retry
from the failed step, NEVER lock-recover a lock it didn't create, and don't chase main with
fresh gates as siblings land under it. Sequential series instead reuse ONE worktree, rebranching
from origin/main per PR.

## Verify (Claude, always)

- `git status -sb` + read the full diff; judge like a contributor PR
- run focused tests yourself or demand proof output; Codex claims are advisory
- iterate via resume; after 2 failed rounds, take over and do it directly
- normal closeout still applies: `$autoreview` before ship
- **check for a live worker in the repo before you edit or commit**:
  `pgrep -fl "codex exec"`. A run whose deliverable is already in the tree can
  keep looping for hours and overwrite your fixes mid-review. Stop it once you
  have verified its output rather than racing it.
- a genuinely independent review pass earns its keep: reviewing the working tree
  after a Codex build found a currency value being fed to a percentage helper
  that clamped at 100, which typechecked, passed every test, and was invisible in
  the worker's own report.

## Economics

Win = generation + exploration tokens moved to Codex; Claude spends only on spec + diff review. Don't ping-pong trivia through delegation; don't re-read what Codex already summarized.
