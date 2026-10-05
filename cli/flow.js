#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpath, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { providerConfig, createRequest, runTurn, loadSession, saveSession } from './agent.js';
import { attemptFallback, fallbackNotice } from './providerFallback.js';
import { createTools, toolDefinitions } from './tools.js';
import { buildSystemPrompt, buildMemoryBlock, g4fDegradedNotice, subagentPrompt, testCommandBlock, KNOWN_PERSONAS } from './prompts.js';
import { detectTestCommand } from './testCommand.js';
import { discoverSkills, buildCompactIndex } from './externalSkills.js';
import { configureSwordBackend, readLocalUnifiedKey } from './backend.js';
import { createSharedClient, recentContext } from './shared.js';
import { resolveModel } from './model.js';
import { RagEngine } from './brain/rag.js';
import { sessions } from './skills/sessions.js';
import { loadMcpConfig } from './mcpConfig.js';
import { runMcpCommand } from './mcpManage.js';
import { runRoutineCommand, loadRoutines } from './routines.js';
import { closeMcpClients, collectMcpDefinitions } from './mcp/dispatch.js';
import { listInstalledSkills } from './skills/store.js';
import { aggregateVotes, formatTeamSummary, parseTeamRounds, TEAM_ROUNDS_DEFAULT } from './team.js';
import * as checkpoints from './checkpoint.js';
import { listProviders } from './providers.js';
import { archiveMessages, archiveHint, HISTORY_THRESHOLD } from './historyArchive.js';
import { projectRequest, degrade, contextBudgetEvent, DEFAULT_BUDGET_TOKENS } from './budget.js';
import { sessionDiff, formatSessionDiff } from './sessionDiff.js';
import { withRetry, classifyError, providerHealth, circuitOpenError } from './providerRetry.js';
import { degradedTurn } from './capability.js';
import { createUsageTracker, estimateTokens } from './usage.js';
import { G4F } from 'g4f';
import {
  cancelMessage, timeoutMessage, toolLine, friendlyError,
  approvePrompt, statusLine, markdownLite, closestCommand,
  banner, safe, thinkingIndicator
} from './ui.js';

// ── RAG + Session singletons ───────────────────────────────────────────────────
const __dirname = import.meta.dirname; // Node ≥20.6; safe in this project
const ragDbPath = join(__dirname, 'brain', 'rag.db');
const ragDb = new RagEngine(ragDbPath);
let localSessionHistory = [];   // messages loaded from --session file at startup

// ── Context budget ────────────────────────────────────────────────────────────
// Every provider request is measured with the deterministic chars/4 estimate from
// cli/budget.js and, when it does not fit, degraded — oldest whole turns dropped
// first, tool pairs kept together, the current input pinned — instead of hitting
// the old fixed-size cliff and dying. SWORD_BUDGET_TOKENS (a positive integer)
// overrides the default ceiling, mainly so tests can drive the degrade path.
const contextBudgetTokens = (() => {
  const fromEnv = Number(process.env.SWORD_BUDGET_TOKENS);
  return Number.isSafeInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_BUDGET_TOKENS;
})();
// Prepended as a system message to any request that had to be degraded, so the
// model knows context went missing instead of assuming the session just started.
// It is request-local only: loadSession() rejects any role outside
// user/assistant/tool, so writing it into the persisted history would make the
// session unloadable on resume.
const CONTEXT_NOTICE = '[Context limit reached — oldest turns dropped. Use /status to see the current budget.]';

/**
 * Replace a live array's CONTENT without rebinding it. `history` is a const on
 * purpose: aliases such as `prior` inside turn() and the shared session's message
 * list observe the same array, so every history update must mutate in place.
 */
function replaceAll(target, next) {
  if (next === target) return; // already the same live array (shared-session alias)
  const items = Array.isArray(next) ? next : [];
  target.length = 0;
  for (const item of items) target.push(item);
}

// ── External-skill index (module-level cache, invalidated on cwd change) ──────
let _skillCache = null;
let _skillCacheCwd = '';
let _skillBlock = '';
async function ensureSkillBlock(cwd) {
  if (_skillCache && _skillCacheCwd === cwd) return;
  _skillCacheCwd = cwd;
  try {
    const skills = await discoverSkills();
    _skillBlock = buildCompactIndex(skills) || '';
    _skillCache = skills;
  } catch { _skillBlock = ''; _skillCache = []; }
}

// ── Custom providers ───────────────────────────────────────────────────────────
// A custom provider is opt-in only. It is used when the caller explicitly names one
// of its models via --model; with no (or an unknown) model hint we deliberately return
// null so the configured local backend stays in charge. Falling back to "the last
// provider in the file" would silently hijack every default run — e.g. a stale
// .flow/providers.json entry would send all traffic to a dead URL and force g4f.
async function resolveCustomProvider(modelHint, fallbackOnly) {
  if (fallbackOnly) return null;
  if (!modelHint) return null;
  const custom = listProviders();
  if (!custom.length) return null;
  const hint = String(modelHint).toLowerCase();
  const match = custom.find(
    p => p.model && p.model.toLowerCase() === hint
      || p.name && p.name.toLowerCase() === hint
      || p.id && p.id.toLowerCase() === hint
  );
  if (!match) return null;
  return { url: match.baseUrl, key: match.apiKey, model: match.model || 'auto' };
}

// ── g4f direct request (no backend needed) ────────────────────────────────────
let g4fClient = null;
function createG4fRequest(tools, signal, onToken) {
  g4fClient ??= new G4F();
  return async messages => {
    // g4f doesn't support tools, so strip tool_calls and convert to plain text
    const plainMessages = messages.map(m => ({
      role: m.role === 'tool' ? 'assistant' : m.role,
      content: m.content || (m.tool_calls ? '[Tool call results omitted]' : '')
    })).filter(m => m.content);
    const result = await g4fClient.chatCompletion(plainMessages, {
      model: 'gpt-4o-mini',
    });
    const text = typeof result === 'string' ? result : result?.content ?? result?.text ?? result?.message?.content ?? '';
    return { choices: [{ message: { role: 'assistant', content: text || 'No response from g4f' } }] };
  };
}

// Character brain modules for team-mode round-robin
const TEAM_CHARACTERS = ['izuku', 'kael', 'mahina', 'muhan', 'sable', 'turing', 'plastos', 'prince_rishad', 'monk_maecenas', 'ada_vance'];
const WRITER_CHARACTERS = ['izuku', 'kael'];
// Three character ids do not match their module filenames, so resolve by prefix
// instead of guessing `${char}.js` — the old guess silently imported nothing and
// `catch {}` swallowed it, making --team a no-op that still cost 13 LLM calls.
async function brainPrompt(charName) {
  const dir = join(__dirname, 'brain');
  let entries = [];
  try { entries = await readdir(dir); } catch { return null; }
  const stem = charName.replace(/_.*$/, '');
  const file = entries.find(name => name.endsWith('.js') && (name === `${charName}.js` || name.startsWith(`${stem}_`) || name.startsWith(`${charName}_`)));
  if (!file) return null;
  const mod = await import(join(dir, file));
  return mod.SYSTEM_PROMPT || null;
}

const HELP = `SwordCLI — project coding assistant
Usage: sword [--cwd DIRECTORY] [--prompt TEXT] [--json] [--session NAME]
  --prompt, -p   Run one task (writes and commands denied without a TTY)
  --cwd          Project directory; defaults to your current directory
  --session      Save/resume conversation in PROJECT/.flow/NAME.json
  --local        Disable web sharing; combine with --session NAME for local storage
  --shared       Create a backend session (default for npm run sword)
  --shared-session ID  Resume a backend session (use its exact workspace)
  --import-session NAME  With --shared, copy a local named session to backend
  --mode         coding | marketing-video (default: coding)
  --persona      Character persona to use (e.g. --persona izuku). Default: neutral.
                 Also: SWORD_PERSONA=izuku env var.
  --model        Override the model (default: strongest available, else auto)
  --team         Round-robin team discussion: all 10 agents deliberate, then a writer responds
  --team-rounds N  Deliberation rounds 1..5 (default 1); later rounds see the vote tally
   --json         One-shot JSON output; includes toolsUsed/toolsRan in the response object
   --help, -h     Show this help
Subcommands:
   sword doctor                      Diagnose provider + tool state; prints exact fix steps
   sword up|down|status|logs         Manage the local backend stack
    sword mcp <add|remove|list|test|show|help>   Connect to and manage MCP servers
      (mcp test NAME connects to a server and lists its tools — the same path
       the agent uses; run it after mcp add to confirm the connection works)
    sword routine <add|list|remove|schedule|run>   Standing tasks: define a prompt,
      schedule it (hourly/daily/weekdays/weekly/once/cron), run it headless, and
      keep a per-run record in .flow/routines/ (read-only by default, safe to schedule)
Power tools available to the model (use naturally in your prompts):
   apply_patch    Apply a unified diff atomically across multiple files (one approval step)
   task           Spawn a parallel read-only sub-agent to investigate a question
   web_search     Search the web (DuckDuckGo, no key required)
   write_file / edit_file / run_command   Create, edit, and execute (each requires approval)
Interactive commands: /help /clear /status /team /web /provider /undo /exit
The session never ends by itself: Ctrl+D exits, Ctrl+C cancels the current turn
(and exits when pressed twice at the prompt), /exit and /quit exit.
Every file edit and command requires approval. At the prompt: y allows once,
a allows that tool for the rest of the session, A allows all writes+commands
for this session (use with care — applies to all future turns), N denies.
Grants live only in this process and are never written to disk.
Commands are NOT sandboxed.
Configuration: OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL; PROXY_HOST fallback.
  SWORD_PERSONA=izuku  Enable character persona (same as --persona izuku)
Model choice: --model, else SWORD_MODEL, else the strongest model the backend
advertises, else backend auto-routing. The backend's balanced routing strategy
picks much weaker models (flash-lite class), so SwordCLI selects a strong one.
Default endpoint: http://localhost:3101/v1 (independent sword-server)
Project content is sent to your chosen provider. Use only trusted workspaces.
`;

async function main() {
  // `doctor` and `mcp` subcommands dispatch before parseArgs so they never
  // require a prompt or spin up the agent.
  //
  // `doctor` diagnoses the LOCAL STACK (ports, DB tokens, model catalog) which the
  // launcher owns, so flow.js forwards to `sword.mjs doctor` — identical behaviour
  // to `sword doctor` without re-implementing the stack checks in the agent.
  const argv = process.argv.slice(2);
  if (argv[0] === 'doctor') {
    const { spawnSync } = await import('node:child_process');
    const launcher = join(__dirname, '..', 'sword.mjs');
    const res = spawnSync(process.execPath, [launcher, 'doctor'], { stdio: 'inherit' });
    process.exitCode = res.status ?? (res.error ? 1 : 0);
    return;
  }
  // `mcp` manages and connects MCP servers without launching the agent (or the
  // stack). It parses its own argv and returns an exit code, so a pure `sword mcp ...`
  // never spins up ollama/api/backend/web or needs a TTY.
  if (argv[0] === 'mcp') {
    const code = await runMcpCommand(argv);
    if (code !== 0) process.exitCode = code;
    return;
  }
  // `routine` manages standing, scheduled tasks (definitions, scheduling, and
  // headless runs). Pure management subcommands need no TTY; `run` is a
  // headless, read-only one-shot turn.
  if (argv[0] === 'routine') {
    const code = await runRoutineCommand(argv);
    if (code !== 0) process.exitCode = code;
    return;
  }
  const { values } = parseArgs({ options: {
    prompt: { type: 'string', short: 'p' }, cwd: { type: 'string' },
    model: { type: 'string' }, session: { type: 'string' }, mode: { type: 'string', default: 'coding' },
    persona: { type: 'string' },
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    shared: { type: 'boolean' }, local: { type: 'boolean' }, 'shared-session': { type: 'string' }, 'import-session': { type: 'string' },
    team: { type: 'boolean' }, 'team-rounds': { type: 'string', default: '1' }
  } });
  if (values.help) { console.log(HELP); return; }
  if (values.json && !values.prompt) throw new Error('--json requires --prompt');
  if (!['coding', 'marketing-video'].includes(values.mode)) throw new Error(`Unknown mode: ${values.mode}`);
  // Only `izuku` has a persona prompt; anything else is not silent — warn and fall
  // back to the neutral default so `--persona turing` can't masquerade as working.
  if (values.persona && !KNOWN_PERSONAS.includes(values.persona.toLowerCase())) {
    console.error(`[sword] unknown persona "${values.persona}" — available: ${KNOWN_PERSONAS.join(', ')}. Using the neutral default.`);
    values.persona = undefined;
  }
  const interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY);
  if (!values.prompt && !interactive) throw new Error('Non-interactive usage requires --prompt TEXT');
  if (values.prompt !== undefined && !values.prompt.trim()) throw new Error('Prompt must not be empty');
  const cwd = await realpath(values.cwd || process.cwd());
  if (!(await stat(cwd)).isDirectory()) throw new Error('--cwd must be a directory');
  if (values.local && (values['shared-session'] || values['import-session'])) throw new Error('--local cannot be combined with shared-session or import-session');
  if (values.local && values.shared) throw new Error('--local and --shared are mutually exclusive; choose one session mode');
  let swordEnv;
  let useG4f = false;
  // Session-scoped approval grants. Approving once per write made a single task cost
  // ~20 keystrokes, which trained people to type blind. Never persisted to disk.
  const grants = { tools: new Set(), deniedTools: new Set() };
  const grantTool = tool => { if (tool) grants.tools.add(tool); };
  const grantAll = () => { for (const t of ['write_file', 'edit_file', 'run_command', 'save_to_rag']) grants.tools.add(t); };
  // Kept so /undo can reach the checkpoint of the most recent turn.
  let lastExecute = null;
  // Session-scoped team consensus, surfaced by /status. Declared here (not inside
  // turn()) because /status reads it from a different scope; without this binding
  // the assignment inside turn() throws a ReferenceError in ESM strict mode and the
  // whole turn silently degrades to the offline fallback.
  let lastTeamAggregate = null;
  // Bind cwd once: the checkpoint module keeps `cwd` explicit (so it stays testable
  // outside a repo) while the tool layer wants a bare `create(label)` callback.
  const checkpointApi = {
    create: label => checkpoints.create(cwd, label),
    restore: snap => checkpoints.restore(cwd, snap)
  };
  try {
    swordEnv = await configureSwordBackend(process.env, readLocalUnifiedKey, { allowSilentFallback: true });
    useG4f = swordEnv._swordG4fFallback === true;
  } catch (err) {
    if (!interactive) throw err;
    useG4f = true;
    swordEnv = { ...process.env, _swordG4fFallback: true, _swordG4fReason: err?.message ?? String(err) };
  }
  if (useG4f && interactive) {
    const reason = swordEnv?._swordG4fReason ? ` (${swordEnv._swordG4fReason})` : '';
    console.error(`[SwordCLI] No Sword backend detected${reason} — using g4f (free) as provider.\n`);
  }
  const useShared = !values.local && !useG4f && (values.shared || Boolean(values['shared-session']));
  if ((useShared && values.session) || (values['import-session'] && (!values.shared || values['shared-session']))) throw new Error('Use --import-session NAME with --shared to copy a local session, not --session');
  const teamRounds = parseTeamRounds(values['team-rounds']);
  const customProvider = await resolveCustomProvider(values.model, useG4f);
  const config = useG4f ? { url: '', key: '', model: 'auto' } : (customProvider || providerConfig(swordEnv));
  // Prefer a strong tool-capable model over the backend's balanced auto-routing.
  const selectedModel = useG4f ? 'auto' : await resolveModel(config, values.model);
  let client = useShared ? createSharedClient(config) : null;
  let shared = null;
  if (client) {
    // A backend that is down, restarted without the shared routes or holding a
    // stale token must not kill the session at startup: degrade to a local one.
    try {
      shared = values['shared-session'] ? await client.getSession(values['shared-session']) :
        await client.createSession({ title: values['import-session'] || 'SwordCLI session', workdir: cwd, mode: values.mode, model: selectedModel });
      if (shared && shared.workdir !== cwd) throw new Error(`Shared session belongs to another workspace. Restart with --cwd ${safe(shared.workdir)}`);
      if (shared && values['import-session']) shared = await client.saveMessages(shared.id, await loadSession(cwd, values['import-session']), shared.revision);
    } catch (error) {
      if (!interactive) throw error;
      console.error(`[sword] Shared session unavailable (${safe(error?.message ?? error)}) — continuing with a local session.`);
      shared = null;
      client = null;
    }
  }
  await ensureSkillBlock(cwd);
  // G5: tell the model the project's real test command so it verifies with evidence.
  const detectedTests = detectTestCommand(cwd);
  const systemExtras = [
    _skillBlock ? `\n\n${_skillBlock}` : '',
    archiveHint(0),
    detectedTests ? `\n\n${testCommandBlock(detectedTests.raw)}` : '',
    useG4f ? `\n\n${g4fDegradedNotice()}` : '',   // G3: honest about a tool-less provider
  ].join('');
  const system = { role: 'system', content: buildSystemPrompt(cwd, shared?.mode || values.mode, values.persona || null) + systemExtras };
  const provider = { ...config, model: values.model || shared?.model || selectedModel };
  // ── MCP remote tools (Phase 4) ─────────────────────────────────────────────
  // Load config, connect to each enabled server ONCE to enumerate its tools, and
  // merge those definitions with the built-ins so the model can actually call
  // them. No config file ⇒ mcpServers stays empty and toolDefs === toolDefinitions
  // (the SDK is never imported — the "zero-cost default" invariant). A config
  // whose servers fail to connect just yields zero MCP defs; the session still
  // works with the built-ins, so a flaky remote can never wedge a turn.
  let mcpServers = [];
  let mcpDefinitions = [];
  try {
    const mcpConfig = loadMcpConfig({ cwd, secrets: true });
    if (mcpConfig?.servers?.length) {
      mcpServers = mcpConfig.servers;
      mcpDefinitions = await collectMcpDefinitions(mcpServers);
      if (interactive) {
        const note = mcpDefinitions.length
          ? `${mcpServers.length} server(s), ${mcpDefinitions.length} remote tool(s) loaded`
          : `${mcpServers.length} configured, 0 tools reachable (SDK missing or server unreachable)`;
        console.error(`[sword] MCP: ${note}`);
      }
    }
  } catch { mcpServers = []; mcpDefinitions = []; }
  const toolDefs = mcpDefinitions.length ? [...toolDefinitions, ...mcpDefinitions] : toolDefinitions;
  // Local, append-only usage accounting (.flow/usage.jsonl, mode 0600). Best-effort:
  // a failed accounting write must never break a turn, so recordTurn is fire-and-forget.
  const usage = createUsageTracker({ cwd, provider: useG4f ? 'g4f' : 'openai-compatible' });
  // `history` is a const binding: every update below mutates the array in place
  // (replaceAll / splice / push) so live aliases keep observing the same array.
  const history = shared ? shared.messages : values.session ? await loadSession(cwd, values.session) : [];
  // Merge local --session history so prior turns are visible to the LLM.
  // Deduplicate by (role, content) so shared backend messages don't double-appear.
  if (values.session && !shared) {
    const key = m => `${m.role}:${(m.content || '').slice(0, 120)}`;
    const existing = new Set(history.map(key));
    for (const m of values.session ? await loadSession(cwd, values.session) : []) {
      if (!existing.has(key(m))) { history.push(m); existing.add(key(m)); }
    }
  }
  if (shared) console.error(`Shared session: ${shared.id} (available in SwordCLI web)`);
  let indicator = null;
  let active;
  let teamMode = Boolean(values.team);
  let archivedCount = 0;
  // Highest retry attempt seen in the current turn, reset at each turn start so the
  // capability_lost event reports THIS turn's retries, not a session-running total.
  let lastRetryAttempts = 0;
  // ── Session lifetime ────────────────────────────────────────────────────────
  // The prompt only ends on an explicit request: /exit, /quit, Ctrl+D or a
  // confirmed Ctrl+C. Nothing else — a failing command, a closed stdin, an
  // unexpected readline close, a stray async error — may end the session.
  let exitRequested = false;
  let ctrlCArmed = false;
  let stdinLossNotified = false;
  let lastQuestionError = null;
  const quit = () => { exitRequested = true; try { rl?.close(); } catch { /* already closed */ } };
  const stdinUsable = () => !process.stdin.destroyed && !process.stdin.readableEnded;
  const ctrlDError = /Ctrl\+D/i;
  let rl = null;
  const cancel = () => {
    if (active) {
      // A turn is in flight: abort it and keep the session; a second Ctrl+C exits.
      ctrlCArmed = true;
      active.abort();
      return;
    }
    const iface = rl;
    if (iface && !iface.closed && iface.line) {
      // Mid-line: clear what was typed first, exactly like a plain readline prompt.
      ctrlCArmed = true;
      try { iface.write(null, { ctrl: true, name: 'u' }); } catch { /* closed meanwhile */ }
      console.error('\n(To exit, press Ctrl+C again or Ctrl+D)');
      return;
    }
    if (ctrlCArmed) { console.error('\nSession closed by Ctrl+C.'); quit(); return; }
    ctrlCArmed = true;
    console.error('\n(To exit, press Ctrl+C again or Ctrl+D)');
  };
  const makeInterface = () => {
    // Build completions for tab completion
    const buildCompletions = () => {
      const completions = new Set();
      // Slash commands
      const slashCommands = [
        'help', 'clear', 'status', 'team', 'models', 'provider',
        'rag', 'web', 'download', 'scrape', 'undo', 'session',
        'history', 'brain', 'model', 'character', 'exit', 'quit',
        'undo', 'routine', 'provider', 'tasks'
      ];
      for (const cmd of slashCommands) completions.add(`/${cmd}`);
      
      // Routine subcommands
      const routineSubs = ['add', 'list', 'remove', 'schedule', 'run', 'help'];
      for (const sub of routineSubs) completions.add(`/routine ${sub}`);
      
      // Team subcommands
      const teamSubs = ['list', 'add', 'remove'];
      for (const sub of teamSubs) completions.add(`/team ${sub}`);
      
      // Character switching: no loadCharacters() API is available yet.
      // Completions will be populated once a character listing function is added.
      const chars = [];
      for (const char of chars) {
        completions.add(`/character ${char.name}`);
      }
      
      // Routine names
      try {
        const routines = loadRoutines({ cwd });
        for (const r of routines.routines) {
          completions.add(`/routine run ${r.name}`);
          completions.add(`/routine schedule ${r.name}`);
          completions.add(`/routine remove ${r.name}`);
        }
      } catch { }
      
      // Model names
      try {
        const models = listModels?.() ?? [];
        for (const m of models) {
          completions.add(`/model ${m}`);
        }
      } catch { }
      
      return Array.from(completions).sort();
    };
    
    const iface = createInterface({
      input: process.stdin,
      output: process.stderr,
      completer: (line) => {
        const hits = buildCompletions().filter(c => c.startsWith(line));
        return [hits.length ? hits : [], line];
      }
    });
    iface.on('SIGINT', cancel);
    iface.on('error', error => console.error(`\nReadline error: ${error?.message ?? error}`));
    return iface;
  };
  if (interactive) rl = makeInterface();
  process.on('SIGINT', cancel);
  // ── Provider resilience ────────────────────────────────────────────────────
  // Every provider call runs through withRetry + the shared circuit breaker: 429/5xx
  // and network failures are retried with backoff+jitter, an auth/404/capability
  // failure is surfaced immediately, and a genuinely-down provider opens the breaker
  // so repeated turns fail fast instead of hammering it. A user cancel is never
  // retried. Retry happens at the REQUEST level only — runTurn already folded the
  // previous tool round into history — so a retried step cannot double-execute tools.
  function resilient(rawRequest) {
    return messages => withRetry(
      async () => {
        if (!providerHealth.allow()) throw circuitOpenError();
        try {
          const response = await rawRequest(messages);
          providerHealth.onSuccess();
          return response;
        } catch (error) {
          providerHealth.onFailure(classifyError(error));
          throw error;
        }
      },
      {
        signal: active?.signal,
        onRetry: info => {
          lastRetryAttempts = Math.max(lastRetryAttempts, info.attempt);
          console.error(`[sword] provider ${info.kind} failure — retry ${info.attempt} in ${info.delayMs}ms`);
        }
      }
    );
  }
  // ── Context budget: project EVERY provider call, degrade honestly ──────────
  // Wrapping the request function (rather than the message list once per turn)
  // means runTurn's tool loop is covered too: each step's grown message list is
  // projected with projectRequest() and, over budget, degraded BEFORE the
  // network call. Degradation is request-local — `history` and the persisted
  // session keep every message; only what travels on the wire is trimmed.
  function budgeted(rawRequest, { report = true } = {}) {
    const request = resilient(rawRequest);
    return async messages => {
      const projected = projectRequest({ messages, tools: toolDefs });
      if (projected.tokens <= contextBudgetTokens) return request(messages);
      // Over budget: degrade in the documented order. This throws only when
      // system + tools + current input alone exceed the budget — the genuinely
      // irreducible case — and that error surfaces instead of a silent over-send.
      const outcome = degrade({ messages, tools: toolDefs, budgetTokens: contextBudgetTokens });
      // Observable `context_budget` event on stderr (JSON line): budget pressure
      // is a first-class session signal, alongside the human-readable notice.
      const budgetEvent = contextBudgetEvent({ projectedTokens: projected.tokens, budgetTokens: contextBudgetTokens, events: outcome.events });
      if (report) {
        console.error(`[sword] context_budget ${JSON.stringify(budgetEvent)}`);
        const dropped = outcome.events.filter(event => event.type === 'drop-turns').reduce((sum, event) => sum + event.messages, 0);
        const shrunk = outcome.events.filter(event => event.type === 'shrink-tool-result').length;
        const how = [dropped ? `dropped ${dropped} old message(s)` : '', shrunk ? `truncated ${shrunk} tool result(s)` : '']
          .filter(Boolean).join('; ');
        console.error(`[sword] Context over budget (${projected.tokens} > ${contextBudgetTokens} tokens): ${how || 'degraded'}; the current input was kept.`);
      }
      // Honest notice + optional archive hint, prepended as a system message.
      // degrade() pinned the system prompt and the current input, so neither is
      // touched here; the notice itself is deliberately not persisted to history.
      const notice = archivedCount > 0 ? `${CONTEXT_NOTICE}${archiveHint(archivedCount)}` : CONTEXT_NOTICE;
      return request([{ role: 'system', content: notice }, ...outcome.messages]);
    };
  }
  // G4: a read-only sub-agent spawned by the `task` tool. It shares cwd/grants/
  // checkpoint with the session but gets NO mutation/command tools and a hard step
  // cap, so a fanned-out worker can investigate (and report) without damaging the
  // tree or bypassing approval. It reuses the session's provider and is recursion-
  // guarded: the sub-agent's tool surface excludes `task` itself.
  const READONLY_TOOLS = new Set(['list_files', 'read_file', 'search_files', 'read_pdf', 'fetch_web', 'fetch_web_rendered', 'web_search', 'load_skill']);
  const taskRunner = async ({ prompt, description, tools, maxSteps, signal: taskSignal }) => {
    const sig = taskSignal ?? active?.signal;
    const requested = Array.isArray(tools) && tools.length ? tools : null;
    const allowed = requested ? requested.filter(n => READONLY_TOOLS.has(n)) : [...READONLY_TOOLS];
    if (!allowed.length) return { summary: '', steps: 0, error: 'task: no read-only tools selected' };
    const subDefs = toolDefinitions.filter(d => allowed.includes(d.function.name));
    const subExecute = createTools({ cwd, approve: async () => false, signal: sig, timeout: 60000, grants, ragDb, checkpoint: checkpointApi, mcpServers: [] });
    const safeExecute = async (toolName, args) => READONLY_TOOLS.has(toolName)
      ? subExecute(toolName, args)
      : { error: `task sub-agent is read-only; ${toolName} is not permitted` };
    const subRequest = useG4f
      ? createG4fRequest(subDefs, sig, undefined)
      : createRequest(provider, subDefs, sig, undefined);
    const seed = [
      { role: 'system', content: subagentPrompt(description) },
      { role: 'user', content: String(prompt) },
    ];
    const steps = Math.max(1, Math.min(10, Number.isFinite(maxSteps) ? Number(maxSteps) : 6));
    try {
      const out = await runTurn({ messages: seed, request: subRequest, execute: safeExecute, maxSteps: steps, signal: sig, onEvent: () => {} });
      return { summary: out.text ?? '', steps };
    } catch (error) {
      return { summary: '', steps: 0, error: `task sub-agent failed: ${error?.message ?? error}` };
    }
  };
  async function turn(prompt) {
    active = new AbortController();
    let completed = null;
    let streamed = false;
    const turnStartedAt = Date.now();
    lastRetryAttempts = 0;
    if (interactive) {
      // A plain "Thinking…" line: ora's TTY spinner loops forever when the
      // terminal reports 0 columns and puts stdin in raw mode behind readline.
      indicator = thinkingIndicator().start();
    }
    const approve = async proposal => {
      if (!rl) return false;
      console.error(`\n`);
      console.error(approvePrompt(proposal));
      try {
        const answer = (await rl.question('Allow? [y] once  [a] always allow this tool  [A] allow all writes/commands  [N] deny\n> ', { signal: active.signal })).trim();
        const choice = answer.toLowerCase();
        if (choice === 'a' || choice === 'always') { grantTool(proposal.tool); return true; }
        if (choice === 'A') { grantAll(); return true; }
        return choice === 'y' || choice === 'yes';
      } catch { return false; }
    };
    try {
      if (shared) {
        shared = await client.getSession(shared.id);
        replaceAll(history, shared.messages); // refresh in place; never rebind `history`
      }
      const context = shared ? await client.context(shared.id, prompt) : '';
      const prior = shared ? recentContext(history) : history;

      // ── Fix A: Local RAG retrieval before every LLM turn ────────────────────
      let ragBlock = '';
      try {
        const ragResults = await ragDb.search(prompt, 5);
        if (ragResults.length > 0) {
          const ragText = ragResults.map(r =>
            `[${r.category}] ${r.title} (score: ${r.score}): ${r.content}`
          ).join('\n\n');
          ragBlock = buildMemoryBlock(ragText);
        }
      } catch { /* RAG is optional; continue without retrieved context */ }

      // Retrieved memory belongs in the system message: as a user turn it could be
      // mistaken for the current request (a leftover prompt hijacked earlier turns).
      const turnSystem = context
        ? { role: 'system', content: `${system.content}\n\n${buildMemoryBlock(context)}` }
        : system;
      const inputs = ragBlock
        ? [{ ...turnSystem, content: `${turnSystem.content}\n\n${ragBlock}` }, ...prior, { role: 'user', content: prompt }]
        : [turnSystem, ...prior, { role: 'user', content: prompt }];

      // ── Fix C: Team mode round-robin ────────────────────────────────────────
      // teamRounds re-runs the roster; each round after the first sees the vote
      // tally so far, and the writer receives the aggregateVotes() consensus.
      let result;
      let lastAggregate = null;
      // lastTeamAggregate is session-scoped so /status can report consensus.
      lastTeamAggregate = null;
      if (teamMode) {
        if (!values.json && interactive) console.error(chalk.dim(`\n[Team] Round-robin discussion starting (${teamRounds} round(s))...\n`));
        const execute = createTools({ cwd, approve, signal: active.signal, timeout: 120000, grants, ragDb, checkpoint: checkpointApi, mcpServers, task: taskRunner });
        lastExecute = execute;
        const discussion = [];
        let teamHistory = [...inputs];
        const maxPerAgent = 1500;
        for (let round = 0; round < teamRounds; round++) {
        // Cycle through registered character agents
        for (let i = 0; i < TEAM_CHARACTERS.length; i++) {
          const charName = TEAM_CHARACTERS[i];
          try {
            const charPrompt = await brainPrompt(charName) || `You are ${charName}. Contribute your perspective concisely.`;
            const tallyNote = lastAggregate ? `\n\nCurrent vote tally after round ${round}: ${formatTeamSummary(lastAggregate)}.` : '';
            const agentInputs = [
              { role: 'system', content: `${charPrompt}\n\nYou are one of 10 agents discussing this request. Be specific and actionable. Max ${maxPerAgent} chars.${tallyNote}` },
              ...teamHistory.slice(1),   // skip system for brevity
              { role: 'user', content: prompt }
            ];
            const agentResult = await runTurn({
              messages: agentInputs,
              // Team sub-calls degrade like any other request; they stay silent so
              // one over-budget turn doesn't print the notice ten times.
              request: budgeted(useG4f ? createG4fRequest(toolDefinitions, active.signal, undefined) : createRequest(provider, toolDefs, active.signal, undefined), { report: false }),
              execute,
              signal: active.signal,
              maxSteps: 3,
              onEvent: () => {},
              onCheckpoint: () => {}
            });
            const reply = (agentResult.text || '').slice(0, maxPerAgent);
            discussion.push({ character: charName, response: reply, round });
            teamHistory = [...teamHistory, { role: 'assistant', content: `[${charName}]: ${reply}` }];
          } catch { /* skip unavailable agents */ }
        }
        lastAggregate = aggregateVotes(discussion);
        lastTeamAggregate = lastAggregate;
        } // end rounds loop
        // Writer agent synthesizes the discussion into a final response
        const writerName = WRITER_CHARACTERS[0];
        try {
          const writerPrompt = await brainPrompt(writerName) || `You are ${writerName}. Synthesize team discussions into clear final responses.`;
          const consensus = lastAggregate?.winner ? `\n\nTeam consensus after ${lastAggregate.rounds} round(s): winner ${lastAggregate.winner} — ${formatTeamSummary(lastAggregate)}.` : '';
          const writerInputs = [
            { role: 'system', content: `${writerPrompt}\n\nYou are the designated writer. Review the team discussion below and produce a single coherent final response that addresses the user's request. Do not reference the team discussion process.${consensus}` },
            { role: 'system', content: 'TEAM DISCUSSION TRANSCRIPT:\n' +
              discussion.map(d => `[${d.character}]: ${d.response}`).join('\n\n') },
            { role: 'user', content: prompt }
          ];
          const writerResult = await runTurn({
            messages: writerInputs,
            request: budgeted(useG4f ? createG4fRequest(toolDefinitions, active.signal, values.json ? undefined : onToken) : createRequest(provider, toolDefs, active.signal, values.json ? undefined : onToken)),
            execute,
            signal: active.signal,
            onEvent: (name, info) => { if (info === undefined) console.error(`  ${toolLine(name)}`); else console.error(`  ${toolLine(name, info)}`); },
            onCheckpoint: () => {}
          });
          result = { text: writerResult.text, messages: writerResult.messages };
        } catch { result = { text: discussion.map(d => `[${d.character}]: ${d.response}`).join('\n\n'), messages: [] }; }
      } else {
        // Journal approved actions as they complete, so a mid-turn provider
        // failure cannot make already-executed commands disappear from history.
        // Local named sessions get the same durability as shared ones.
        const checkpoint = shared
          ? messages => { completed = [...history, { role: 'user', content: prompt }, ...messages.slice(inputs.length)]; }
          : values.session ? messages => { completed = messages.slice(1); } : () => {};
        const execute = createTools({ cwd, approve, signal: active.signal, timeout: 120000, grants, ragDb, checkpoint: checkpointApi, mcpServers, task: taskRunner });
        lastExecute = execute;
        // Stream tokens to stderr only for a human at a terminal, so --json output and
        // piped stdout stay clean. The first token retires the indicator.
        const onToken = interactive && !values.json
          ? chunk => {
              if (!streamed) { streamed = true; indicator?.stop(); indicator = null; }
              process.stderr.write(safe(chunk));
            }
          : undefined;
        result = await runTurn({
          messages: inputs,
          request: budgeted(useG4f ? createG4fRequest(toolDefinitions, active.signal, onToken) : createRequest(provider, toolDefs, active.signal, onToken)), execute, signal: active.signal,
          onEvent: (name, info) => {
            if (info === undefined) { console.error(`  ${toolLine(name)}`); }
            else { console.error(`  ${toolLine(name, info)}`); }
          }, onCheckpoint: checkpoint
        });
      }
      // Team mode: persist only user + final writer response.
      // Normal mode: strip the system message from result.messages.
      const nextHistory = teamMode
        ? [...history, { role: 'user', content: prompt }, { role: 'assistant', content: result.text }]
        : [...history, { role: 'user', content: prompt }, ...result.messages.slice(inputs.length)];
      if (shared) {
        try { shared = await client.saveMessages(shared.id, nextHistory, shared.revision); }
        catch (error) {
          const recovery = `recovery_${Date.now()}`;
          await saveSession(cwd, recovery, nextHistory);
          throw new Error(`${error.message}. Completed turn saved locally as ${recovery}; do not repeat tool actions blindly.`);
        }
      }
      replaceAll(history, nextHistory); // in place: the binding is const and aliases must see the update
      // Archive messages that exceed the retention window so they stop consuming
      // context while staying searchable in the RAG engine.
      if (!shared && history.length > HISTORY_THRESHOLD) {
        try {
          // Use `kept` — NOT a re-slice of `history`: kept carries the single
          // placeholder stub, and re-slicing would drop it, making a resumed
          // session pretend the conversation had just started. Passing
          // archivedCount keeps the stub's tally honest across archive passes.
          const { archived, kept } = await archiveMessages(history, HISTORY_THRESHOLD, archivedCount);
          if (archived > 0) {
            archivedCount += archived;
            replaceAll(history, kept);
            console.error(`[sword] Archived ${archived} turn(s) into knowledge library; kept ${history.length} recent messages.`);
          }
        } catch { /* best-effort; don't break the session */ }
      }
      if (values.session) await saveSession(cwd, values.session, history);
      indicator?.stop();
      indicator = null;
      // Usage accounting is best-effort and never awaited: the turn is already
      // complete, and a failed .flow/usage.jsonl write must not surface as an error.
      usage.recordTurn({
        model: provider.model,
        provider: useG4f ? 'g4f' : 'openai-compatible',
        promptTokens: estimateTokens(JSON.stringify(inputs)),
        completionTokens: estimateTokens(result.text || ''),
        estimated: true,
        durationMs: Date.now() - turnStartedAt,
      }).catch(() => {});
      // Count tool messages in this turn's new messages (after inputs) to surface
      // an accurate `toolsRan` count. Without this, `toolsUsed` only appeared in
      // the degraded path, leaving the successful path ambiguous — a tool turn and
      // a chat-only turn looked identical in --json mode.
      const turnMessages = result.messages.slice(inputs.length);
      const toolsRan = turnMessages.filter(m => m.role === 'tool').length;
      if (values.json) { console.log(JSON.stringify({ response: result.text, toolsUsed: toolsRan > 0, toolsRan })); }
      else if (streamed) process.stderr.write('\n');
      else if (interactive) console.log(markdownLite(result.text, true));
      else console.log(safe(result.text));
    } catch (error) {
      // The finally below clears `active` before the REPL catch sees this error, so
      // read the abort fact now. A Ctrl+C anywhere in a turn — including on an
      // approval prompt, where the permission error is what surfaces — is a
      // cancellation: never a provider failure, never the offline fallback.
      const cancelled = active.signal.aborted || error?.name === 'AbortError';
      if (cancelled && error && typeof error === 'object') error.abortedByUser = true;
      if (completed && completed.length > history.length) {
        try {
          const recovery = `recovery_${Date.now()}`;
          await saveSession(cwd, recovery, completed);
          console.error(`Completed actions before the failure were saved locally as ${recovery}; do not repeat tool actions blindly.`);
        } catch { /* best effort; surface the original error */ }
      }
      indicator?.stop();
      indicator = null;
      if (!cancelled) {
        // A coding turn that ends in fallback prose has produced nothing useful, but
        // recovery_<ts> sessions were already written above — point the user at them
        // instead of letting the chat-only reply look like the whole result.
        const saved = completed && completed.length > history.length;
        // Structured, machine-readable fact that THIS turn lost its tools: the legacy
        // notice string is kept, and the same fact is emitted as a capability_lost
        // event so a caller (or --json consumer) is never left guessing from prose.
        const lost = degradedTurn({
          retryAttempts: lastRetryAttempts,
          lost: [{ capability: 'tools', provider: provider.model, reason: safe(error?.message ?? error) }],
        });
        console.error(`[sword] ${JSON.stringify(lost)}`);
        try {
          console.error(`\n${fallbackNotice()}`);
          const res = await attemptFallback(prompt);
          if (values.json) { console.log(JSON.stringify({ response: res, degraded: true, toolsUsed: false, sessionSaved: saved, retryAttempts: lost.retryAttempts, capability_lost: lost })); }
          else if (interactive) { console.log(markdownLite(res, true)); console.error(saved ? '\nActions completed before the failure are in the saved recovery session.' : ''); }
          else console.log(safe(res));
          return;
        } catch { throw error; }
      }
      throw error;
    } finally { active = undefined; }
  }
  // ── One parsed input line ────────────────────────────────────────────────────
  // Every command runs inside the caller's try/catch: a dead shared backend, a
  // malformed /provider argument or a missing import must never end the session.
  async function handleLine(line) {
    if (line === '/help') { console.error(HELP + `\n/status  Show session, model, cwd and history.\n/team    Toggle round-robin team discussion mode (10 agents + writer)`); return; }
    if (line === '/status') {
      // Compute everything BEFORE printing anything: readline drops lines that
      // arrive while no question() is pending, so an await between the first and
      // last output line (sessionDiff runs git) would swallow the user's next
      // input. After the prints below this handler returns synchronously.
      // Tokens the next request would spend (history + tool schemas) vs. the ceiling.
      const projected = projectRequest({ messages: history, tools: toolDefs });
      const percent = Math.min(100, Math.round((projected.tokens / contextBudgetTokens) * 100));
      // Workspace state comes from git, so it stays correct even after archiving
      // trimmed the message log down to the placeholder stub. No session-start
      // snapshot exists yet, so `snapshot` is null and sessionDiff falls back to
      // the oldest surviving checkpoint (or reports unavailable outside a repo).
      const diff = await sessionDiff({ cwd, snapshot: null, history, archivedCount });
      const block = formatSessionDiff(diff);
      if (shared) {
        console.error(statusLine({ mode: values.mode, model: provider.model, cwd, session: shared.id, revision: shared.revision, historyCount: history.length, approval: 'required for all edits and commands', extra: teamMode ? 'team: ON' : undefined }));
      } else if (values.session) {
        console.error(statusLine({ mode: values.mode, model: provider.model, cwd, session: values.session, historyCount: history.length, approval: 'required for all edits and commands', extra: teamMode ? 'team: ON' : undefined }));
      } else {
        console.error(statusLine({ mode: values.mode, model: provider.model, cwd, historyCount: history.length, approval: 'required for all edits and commands', extra: teamMode ? 'team: ON' : undefined }));
      }
      console.error(`  ${chalk.dim('context:')}   ${projected.tokens} / ${contextBudgetTokens} tokens (${percent}%)`);
      // Session usage so far: from the in-memory tracker (the jsonl on disk is the
      // durable history; this is the running total for the live session).
      const spend = usage.session();
      if (spend.turns > 0) {
        const cost = spend.cost_usd ? `, $${spend.cost_usd.toFixed(4)}` : '';
        console.error(`  ${chalk.dim('usage:')}     ${spend.turns} turn(s), ${spend.tokens_in} in / ${spend.tokens_out} out tokens${cost} → ${usage.file}`);
      }
      if (archivedCount > 0) console.error(`  ${chalk.dim('archived:')}  ${archivedCount} turn(s) live in the knowledge library`);
      if (block) console.error(`\n${block}`);
      // Phase 4 ecosystem state: MCP servers (loaded + connected at startup),
      // verified project skills, and the team vote consensus. All read-only and
      // best-effort — /status must never fail because an optional subsystem did.
      try {
        if (!mcpServers.length) console.error(`  ${chalk.dim('mcp:')}       no config (.sword/mcp.json)`);
        else console.error(`  ${chalk.dim('mcp:')}       ${mcpServers.length} server(s), ${mcpDefinitions.length} remote tool(s) loaded`);
      } catch { /* optional subsystem; never break /status */ }
      try {
        const installed = listInstalledSkills({ cwd });
        console.error(`  ${chalk.dim('skills:')}    ${installed.length ? installed.map(s => s.name).join(', ') : 'no verified project skills'}`);
      } catch { /* optional subsystem; never break /status */ }
      if (teamMode) {
        console.error(`  ${chalk.dim('team:')}      ON (${TEAM_CHARACTERS.length} agents, ${teamRounds} round(s))${lastTeamAggregate?.winner ? `; consensus: ${lastTeamAggregate.winner}` : ''}`);
      }
      return;
    }
    if (line === '/team') {
      teamMode = !teamMode;
      console.error(chalk.cyan(`[System] Team mode is now ${teamMode ? 'ON' : 'OFF'}`));
      return;
    }
    if (line === '/clear') {
      if (shared) shared = await client.saveMessages(shared.id, [], shared.revision);
      history.length = 0; // in place; the binding is const
      if (values.session) await saveSession(cwd, values.session, history);
      console.error('Conversation cleared.');
      return;
    }
    if (line.startsWith('/providers') || line.startsWith('/provider')) {
      const parts = line.split(/\s+/);
      const sub = parts[1] || '';
      const { listProviders, addProvider, removeProvider } = await import('./providers.js');
      if (!sub || sub === 'list' || sub === 'ls') {
        const custom = listProviders();
        console.error(`\nProviders:\n  local   ${config.url || 'http://127.0.0.1:3101/v1'}\n  g4f     anonymous fallback\n  remote  SWORDCLI_BASE_URL / OPENAI_BASE_URL`);
        if (custom.length) {
          for (const p of custom) console.error(`  custom  ${p.name} -> ${p.baseUrl} (model: ${p.model || 'default'})`);
        }
        console.error(`\nModels:\n  current: ${provider.model}\n  config: --model, SWORD_MODEL, or backend auto-routing\n\nUsage: /provider add <name> <baseUrl> <apiKey> <model>\n       /provider remove <id>\n`);
      } else if (sub === 'add' && parts[2] && parts[3] && parts[4]) {
        const name = parts[2];
        const baseUrl = parts[3];
        const apiKey = parts[4];
        const model = parts[5] || '';
        addProvider({ name, baseUrl, apiKey, model });
        console.error(`Provider added: ${name}`);
      } else if (sub === 'remove' && parts[1]) {
        removeProvider(parts[1]);
        console.error(`Provider removed`);
      } else {
        console.error('Usage: /provider list | add <name> <baseUrl> <apiKey> <model> | remove <id>');
      }
      return;
    }
    if (line === '/models') {
      console.error(`\nModels:\n  current: ${provider.model}\n  config: --model, SWORD_MODEL, or backend auto-routing\n`);
      return;
    }
    if (line.startsWith('/rag ')) {
      const sub = line.split(/\s+/)[1];
      if (sub === 'add' || sub === 'search') {
        console.error(`RAG ${sub} is available via tool approval in turns. Use a normal prompt and approve the tool call.`);
      } else {
        console.error('Usage: /rag add|search <query-or-path>');
      }
      return;
    }
    if (line === '/web') {
      // Prefer an explicit URL, else the unified web UI served by the Sword
      // backend itself (same origin as /api + /v1, so no CORS split-brain).
      // SWORD_WEB_PORT defaults to the independent web UI port (3002);
      // sword-server itself is API-only on :3101.
      const port = process.env.SWORD_WEB_PORT || '3002';
      const url = process.env.SWORD_WEB_URL || `http://localhost:${port}`;
      console.error(`Opening web UI: ${url} (backend also serves /v1 + /api/agent on this port)`);
      try {
        // execCommand is internal-only; open the browser via a plain spawn.
        const { spawn } = await import('node:child_process');
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
        const args = process.platform === 'win32' ? ['/c', 'start', url] : [url];
        await new Promise(resolve => {
          const child = spawn(opener, args, { stdio: 'ignore', detached: true });
          child.on('error', () => resolve());
          child.unref();
          setTimeout(resolve, 1500);
        });
      } catch {
        console.error(`Open it manually: ${url}`);
      }
      return;
    }
    if (line.startsWith('/download ') || line.startsWith('/scrape ')) {
      const target = line.split(/\s+/)[1];
      if (!target) { console.error('Usage: /download|/scrape <url>'); return; }
      try {
        const { fetchWebRendered } = await import('./webFetch.js');
        const payload = await fetchWebRendered(target, { maxChars: 12000 });
        console.error(`\n[web] ${payload.title || target} (${payload.chars} chars)\n${payload.markdown.slice(0, 2000)}\n`);
      } catch (e) {
        console.error(`Web fetch failed: ${e instanceof Error ? e.message : e}`);
      }
      return;
    }
    if (line.startsWith('/providers') || line.startsWith('/provider')) {
      const parts = line.split(/\s+/);
      const sub = parts[1] || '';
      const { listProviders, addProvider, removeProvider } = await import('./providers.js');
      if (!sub || sub === 'list' || sub === 'ls') {
        const custom = listProviders();
        console.error(`
Providers:
  local   ${config.url || 'http://127.0.0.1:3101/v1'}
  g4f     anonymous fallback
  remote  SWORDCLI_BASE_URL / OPENAI_BASE_URL`);
        if (custom.length) {
          for (const p of custom) console.error(`  custom  ${p.name} -> ${p.baseUrl} (model: ${p.model || 'default'})`);
        }
        console.error(`
Models:
  current: ${provider.model}
  config: --model, SWORD_MODEL, or backend auto-routing

Usage: /provider add <name> <baseUrl> <apiKey> <model>
       /provider remove <id>`);
      } else if (sub === 'add' && parts[1] && parts[2] && parts[3]) {
        const name = parts[1];
        const baseUrl = parts[2];
        const apiKey = parts[3];
        const model = parts[4] || '';
        addProvider({ name, baseUrl, apiKey, model });
        console.error(`Provider added: ${name}`);
      } else if (sub === 'remove' && parts[1]) {
        removeProvider(parts[1]);
        console.error('Provider removed');
      } else {
        console.error('Usage: /provider');
      }
      return;
    }

    if (line === '/') {
      console.log('\nAvailable commands:\n' +
        '  /help           Show this help\n' +
        '  /clear          Clear conversation history\n' +
        '  /status         Show session, model, cwd, history count\n' +
        '  /team           Toggle team collaboration mode\n' +
        '  /team list      Show team members\n' +
        '  /team add <char>    Add character to team\n' +
        '  /team remove <char> Remove character from team\n' +
        '  /models         List available models\n' +
        '  /provider       List/configure custom providers\n' +
        '  /rag add <path|url>  Add to knowledge base\n' +
        '  /rag search <query>  Search knowledge base\n' +
        '  /web <url>      Fetch web page\n' +
        '  /download <url>   Download file\n' +
        '  /scrape <url>    Fetch JS-rendered page\n' +
        '  /undo          Roll back every file change made in the last turn\n' +
        '  /session        Session info\n' +
        '  /history        Conversation history\n' +
        '  /brain          Current character info\n' +
        '  /model <name>     Set model\n' +
        '  /character <name> Switch character\n' +
        '  /exit, /quit      Exit SwordCLI\n');
      return;
    }

    if (line === '/undo') {
      const ctrl = lastExecute?.checkpoint;
      if (!ctrl?.pending) {
        console.error('Nothing to roll back: the last turn changed no approved files.');
        return;
      }
      const changed = await checkpoints.changedSince(cwd, ctrl.snapshot);
      const result = await ctrl.undo();
      if (!result.ok) { console.error(`Rollback failed: ${result.reason}`); return; }
      const removed = result.removed?.length ? `, removed ${result.removed.length} new file(s)` : '';
      console.error(`Rolled back the last turn${removed}.` +
        (changed?.total ? ` Reverted ${changed.tracked} modified, ${changed.untracked} added.` : ''));
      // The agent's view of the tree is now stale, so drop its history rather than
      // let it reason about files that no longer exist.
      history.length = 0; // in place; the binding is const
      console.error('Conversation history cleared; the agent must re-read the project.');
      return;
    }

    if (line.startsWith('/')) {
      const suggest = closestCommand(line);
      if (suggest) console.error(`Unknown command. Did you mean /${suggest}? Use /help.`);
      else console.error(`Unknown command. Use /help.`);
      return;
    }
    await turn(line);
  }

  // Ctrl+D closes the interface without settling the pending question, so the
  // question races the close event. readline reports the reason ("Aborted with
  // Ctrl+D") as a rejection that lands right after the close event, which is how
  // Ctrl+D is told apart from a close nobody asked for.
  function ask(iface) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => { if (!settled) { settled = true; resolve(result); } };
      const onClose = () => setImmediate(() => finish({ closed: true, reason: lastQuestionError }));
      iface.once('close', onClose);
      iface.question('\nsword> ').then(
        value => { iface.removeListener('close', onClose); finish({ value: String(value ?? '') }); },
        error => {
          iface.removeListener('close', onClose);
          lastQuestionError = error;
          finish({ closed: true, reason: error });
        }
      );
    });
  }

  // The prompt ends on an explicit request only: /exit, /quit, Ctrl+D, or Ctrl+C
  // pressed twice (once to clear/abort, once to confirm). Everything else — a
  // failing command, stdin disappearing, a spurious readline close, a stray async
  // error — recovers and keeps the session alive.
  async function repl() {
    const keepAlive = (label, error) => {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error(`\n[${label}] ${detail}\nThe session is still running; press Ctrl+D or Ctrl+C to exit.`);
    };
    const onUncaught = error => keepAlive('internal error', error);
    const onRejection = reason => keepAlive('unhandled rejection', reason);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onRejection);
    try {
      while (!exitRequested) {
        if (rl?.closed) rl = null;
        if (!rl) {
          if (!stdinUsable()) {
            // stdin is gone (EOF/pipe closed). The session still must not end on
            // its own, so wait instead of spinning; Ctrl+C remains available.
            if (!stdinLossNotified) {
              stdinLossNotified = true;
              console.error('\n[stdin closed] The session is still running; press Ctrl+C to exit.');
            }
            await new Promise(resolve => setTimeout(resolve, 250));
            continue;
          }
          rl = makeInterface();
        }
        if (typeof process.stdin.isPaused === 'function' && process.stdin.isPaused()) process.stdin.resume();
        const asked = await ask(rl);
        if (asked.closed) {
          const reason = asked.reason;
          lastQuestionError = null;
          if (exitRequested) break;                                   // /exit, /quit or Ctrl+C
          // Node >=22 rejects the pending question with "Aborted with Ctrl+D"; on
          // older builds a still-open stdin closing the prompt is Ctrl+D as well.
          const endOfInput = ctrlDError.test(reason?.message ?? '') || (reason == null && stdinUsable());
          if (endOfInput) { console.error('\nSession closed by Ctrl+D.'); break; }
          console.error('\nReadline closed unexpectedly; the session continues (Ctrl+D or Ctrl+C to exit).');
          try { rl?.close(); } catch { /* already closed */ }
          rl = null;
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }
        ctrlCArmed = false;
        const line = String(asked.value).trim();
        if (!line) continue;
        try {
          if (line === '/exit' || line === '/quit') { console.error('Bye.'); break; }
          await handleLine(line);
        } catch (error) {
          console.error(friendlyError(error, { aborted: error?.abortedByUser === true || error?.name === 'AbortError' }));
        }
      }
    } finally {
      process.removeListener('uncaughtException', onUncaught);
      process.removeListener('unhandledRejection', onRejection);
    }
  }

  try {
    if (values.prompt) { await turn(values.prompt); return; }
    console.error(banner({ mode: values.mode, model: provider.model, cwd }));
    console.error(`/help for commands. Ctrl+C cancels the current turn; Ctrl+C again or Ctrl+D exits.`);
    await repl();
  } finally {
    process.removeListener('SIGINT', cancel);
    try { rl?.close(); } catch { /* already closed */ }
    // Terminate any stdio MCP server child processes we connected to at startup.
    // Best-effort: a failure here must not mask a real error from the turn.
    try { await closeMcpClients(); } catch { /* already gone */ }
  }
}
main().catch(error => {
  const aborted = error?.name === 'AbortError';
  console.error(friendlyError(error, { aborted }));
  if (!aborted) process.exitCode = 1;
});
