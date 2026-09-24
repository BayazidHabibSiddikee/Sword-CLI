#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { providerConfig, createRequest, runTurn, loadSession, saveSession } from './agent.js';
import { attemptFallback, fallbackNotice } from './providerFallback.js';
import { createTools, toolDefinitions } from './tools.js';
import { buildSystemPrompt, buildMemoryBlock } from './prompts.js';
import { configureSwordBackend, readLocalUnifiedKey } from './backend.js';
import { createSharedClient, recentContext } from './shared.js';
import { resolveModel } from './model.js';
import { RagEngine } from '../brain/rag.js';
import { sessions } from '../skills/sessions.js';
import { listProviders } from './providers.js';
import { G4F } from 'g4f';
import {
  cancelMessage, timeoutMessage, toolLine, friendlyError,
  approvePrompt, statusLine, markdownLite, closestCommand,
  banner, safe, thinkingIndicator
} from './ui.js';

// ── RAG + Session singletons ───────────────────────────────────────────────────
const __dirname = import.meta.dirname; // Node ≥20.6; safe in this project
const ragDb = new RagEngine(join(__dirname, 'brain', 'rag.db'));
let localSessionHistory = [];   // messages loaded from --session file at startup

// ── Custom providers ───────────────────────────────────────────────────────────
async function resolveCustomProvider(modelHint, fallbackOnly) {
  const custom = listProviders();
  if (!custom.length) return null;
  const match = modelHint ? custom.find(p => p.model && p.model.toLowerCase() === String(modelHint).toLowerCase()) || custom[custom.length - 1] : custom[custom.length - 1];
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
  --model        Override the model (default: strongest available, else auto)
  --team         Round-robin team discussion: all 10 agents deliberate, then a writer responds
  --json         One-shot JSON output, diagnostics on stderr
  --help, -h     Show this help
Interactive: /help /clear /status /team /web /exit
The session never ends by itself: Ctrl+D exits, Ctrl+C cancels the current turn
(and exits when pressed twice at the prompt), /exit and /quit exit.
Every file edit and command requires explicit approval. Commands are NOT sandboxed.
Configuration: OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL; PROXY_HOST fallback.
Model choice: --model, else SWORD_MODEL, else the strongest model the backend
advertises, else backend auto-routing. The backend's balanced routing strategy
picks much weaker models (flash-lite class), so SwordCLI selects a strong one.
Default endpoint: http://localhost:3101/v1 (independent sword-server)
Project content is sent to your chosen provider. Use only trusted workspaces.
`;
async function main() {
  const { values } = parseArgs({ options: {
    prompt: { type: 'string', short: 'p' }, cwd: { type: 'string' },
    model: { type: 'string' }, session: { type: 'string' }, mode: { type: 'string', default: 'coding' },
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    shared: { type: 'boolean' }, local: { type: 'boolean' }, 'shared-session': { type: 'string' }, 'import-session': { type: 'string' },
    team: { type: 'boolean' }
  } });
  if (values.help) { console.log(HELP); return; }
  if (values.json && !values.prompt) throw new Error('--json requires --prompt');
  if (!['coding', 'marketing-video'].includes(values.mode)) throw new Error(`Unknown mode: ${values.mode}`);
  const interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY);
  if (!values.prompt && !interactive) throw new Error('Non-interactive usage requires --prompt TEXT');
  if (values.prompt !== undefined && !values.prompt.trim()) throw new Error('Prompt must not be empty');
  const cwd = await realpath(values.cwd || process.cwd());
  if (!(await stat(cwd)).isDirectory()) throw new Error('--cwd must be a directory');
  if (values.local && (values['shared-session'] || values['import-session'])) throw new Error('--local cannot be combined with shared-session or import-session');
  if (values.local && values.shared) throw new Error('--local and --shared are mutually exclusive; choose one session mode');
  let swordEnv;
  let useG4f = false;
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
  const system = { role: 'system', content: buildSystemPrompt(cwd, shared?.mode || values.mode) };
  const provider = { ...config, model: values.model || shared?.model || selectedModel };
  let history = shared ? shared.messages : values.session ? await loadSession(cwd, values.session) : [];
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
    const iface = createInterface({ input: process.stdin, output: process.stderr });
    iface.on('SIGINT', cancel);
    iface.on('error', error => console.error(`\nReadline error: ${error?.message ?? error}`));
    return iface;
  };
  if (interactive) rl = makeInterface();
  process.on('SIGINT', cancel);
  async function turn(prompt) {
    active = new AbortController();
    let completed = null;
    let streamed = false;
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
        return (await rl.question('Allow this one action? [y/N] ', { signal: active.signal })).trim().toLowerCase() === 'y';
      } catch { return false; }
    };
    try {
      if (shared) {
        shared = await client.getSession(shared.id);
        history = shared.messages;
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
      let result;
      if (teamMode) {
        if (!values.json && interactive) console.error(chalk.dim('\n[Team] Round-robin discussion starting...\n'));
        const execute = createTools({ cwd, approve, signal: active.signal, timeout: 120000 });
        const discussion = [];
        let teamHistory = [...inputs];
        const maxPerAgent = 1500;
        // Cycle through registered character agents
        for (let i = 0; i < TEAM_CHARACTERS.length; i++) {
          const charName = TEAM_CHARACTERS[i];
          try {
            const brainModule = await import(join('..', 'brain', `${charName}.js`));
            const charPrompt = brainModule.SYSTEM_PROMPT || `You are ${charName}. Contribute your perspective concisely.`;
            const agentInputs = [
              { role: 'system', content: `${charPrompt}\n\nYou are one of 10 agents discussing this request. Be specific and actionable. Max ${maxPerAgent} chars.` },
              ...teamHistory.slice(1),   // skip system for brevity
              { role: 'user', content: prompt }
            ];
            const agentResult = await runTurn({
              messages: agentInputs,
              request: useG4f ? createG4fRequest(toolDefinitions, active.signal, undefined) : createRequest(provider, toolDefinitions, active.signal, undefined),
              execute,
              signal: active.signal,
              maxSteps: 3,
              onEvent: () => {},
              onCheckpoint: () => {}
            });
            const reply = (agentResult.text || '').slice(0, maxPerAgent);
            discussion.push({ character: charName, response: reply });
            teamHistory = [...teamHistory, { role: 'assistant', content: `[${charName}]: ${reply}` }];
          } catch { /* skip unavailable agents */ }
        }
        // Writer agent synthesizes the discussion into a final response
        const writerName = WRITER_CHARACTERS[0];
        try {
          const writerBrain = await import(join('..', 'brain', `${writerName}.js`));
          const writerPrompt = writerBrain.SYSTEM_PROMPT || `You are ${writerName}. Synthesize team discussions into clear final responses.`;
          const writerInputs = [
            { role: 'system', content: `${writerPrompt}\n\nYou are the designated writer. Review the team discussion below and produce a single coherent final response that addresses the user's request. Do not reference the team discussion process.` },
            { role: 'system', content: 'TEAM DISCUSSION TRANSCRIPT:\n' +
              discussion.map(d => `[${d.character}]: ${d.response}`).join('\n\n') },
            { role: 'user', content: prompt }
          ];
          const writerResult = await runTurn({
            messages: writerInputs,
            request: useG4f ? createG4fRequest(toolDefinitions, active.signal, values.json ? undefined : onToken) : createRequest(provider, toolDefinitions, active.signal, values.json ? undefined : onToken),
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
        const execute = createTools({ cwd, approve, signal: active.signal, timeout: 120000 });
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
          request: useG4f ? createG4fRequest(toolDefinitions, active.signal, onToken) : createRequest(provider, toolDefinitions, active.signal, onToken), execute, signal: active.signal,
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
      history = nextHistory;
      if (values.session) await saveSession(cwd, values.session, history);
      indicator?.stop();
      indicator = null;
      if (values.json) { console.log(JSON.stringify({ response: result.text })); }
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
        try {
          console.error(`\n${fallbackNotice()}`);
          const res = await attemptFallback(prompt);
          if (values.json) { console.log(JSON.stringify({ response: res })); }
          else if (interactive) console.log(markdownLite(res, true));
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
      if (shared) {
        console.error(statusLine({ mode: values.mode, model: provider.model, cwd, session: shared.id, revision: shared.revision, historyCount: history.length, approval: 'required for all edits and commands', extra: teamMode ? 'team: ON' : undefined }));
      } else if (values.session) {
        console.error(statusLine({ mode: values.mode, model: provider.model, cwd, session: values.session, historyCount: history.length, approval: 'required for all edits and commands', extra: teamMode ? 'team: ON' : undefined }));
      } else {
        console.error(statusLine({ mode: values.mode, model: provider.model, cwd, historyCount: history.length, approval: 'required for all edits and commands', extra: teamMode ? 'team: ON' : undefined }));
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
      history = [];
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
      } else if (sub === 'add' && parts[1] && parts[2] && parts[3]) {
        const name = parts[1];
        const baseUrl = parts[2];
        const apiKey = parts[3];
        const model = parts[4] || '';
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
  }
}
main().catch(error => {
  const aborted = error?.name === 'AbortError';
  console.error(friendlyError(error, { aborted }));
  if (!aborted) process.exitCode = 1;
});
