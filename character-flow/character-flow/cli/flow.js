#!/usr/bin/env node
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { realpath, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { providerConfig, createRequest, runTurn, loadSession, saveSession } from './agent.js';
import { createTools, toolDefinitions } from './tools.js';
import { buildSystemPrompt, buildMemoryBlock } from './prompts.js';
import { configureSwordBackend } from './backend.js';
import { createSharedClient, recentContext } from './shared.js';
import { resolveModel } from './model.js';

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
  --json         One-shot JSON output, diagnostics on stderr
  --help, -h     Show this help

Interactive: /help /clear /exit
Every file edit and command requires explicit approval. Commands are NOT sandboxed.
Configuration: OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_MODEL; PROXY_HOST fallback.
Model choice: --model, else SWORD_MODEL, else the strongest model the backend
advertises, else backend auto-routing. The backend's balanced routing strategy
picks much weaker models (flash-lite class), so SwordCLI selects a strong one.
Default endpoint: http://localhost:3001/v1
Project content is sent to your chosen provider. Use only trusted workspaces.
`;
const safe = text => stripVTControlCharacters(String(text)).replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '');

async function main() {
  const { values } = parseArgs({ options: {
    prompt: { type: 'string', short: 'p' }, cwd: { type: 'string' },
    model: { type: 'string' }, session: { type: 'string' }, mode: { type: 'string', default: 'coding' },
    json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    shared: { type: 'boolean' }, local: { type: 'boolean' }, 'shared-session': { type: 'string' }, 'import-session': { type: 'string' }
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
  const useShared = !values.local && (values.shared || Boolean(values['shared-session']));
  if ((useShared && values.session) || (values['import-session'] && (!values.shared || values['shared-session']))) throw new Error('Use --import-session NAME with --shared to copy a local session, not --session');
  const config = providerConfig(await configureSwordBackend(process.env));
  // Prefer a strong tool-capable model over the backend's balanced auto-routing.
  const selectedModel = await resolveModel(config, values.model);
  const client = useShared ? createSharedClient(config) : null;
  let shared = client ? (values['shared-session'] ? await client.getSession(values['shared-session']) :
    await client.createSession({ title: values['import-session'] || 'SwordCLI session', workdir: cwd, mode: values.mode, model: selectedModel })) : null;
  if (shared && shared.workdir !== cwd) throw new Error(`Shared session belongs to another workspace. Restart with --cwd ${safe(shared.workdir)}`);
  if (shared && values['import-session']) shared = await client.saveMessages(shared.id, await loadSession(cwd, values['import-session']), shared.revision);
  const system = { role: 'system', content: buildSystemPrompt(cwd, shared?.mode || values.mode) };
  const provider = { ...config, model: values.model || shared?.model || selectedModel };
  let history = shared ? shared.messages : values.session ? await loadSession(cwd, values.session) : [];
  if (shared) console.error(`Shared session: ${shared.id} (available in SwordCLI web)`);
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stderr }) : null;
  let active;
  const cancel = () => { if (active) active.abort(); else rl?.close(); };
  process.on('SIGINT', cancel);
  rl?.on('SIGINT', cancel);
  async function turn(prompt) {
    active = new AbortController();
    let completed = null;
    const approve = async proposal => {
      if (!rl) return false;
      console.error(`\nApproval required (commands run with your OS permissions):\n${safe(JSON.stringify(proposal, null, 2))}`);
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
      // Retrieved memory belongs in the system message: as a user turn it could be
      // mistaken for the current request (a leftover prompt hijacked earlier turns).
      const turnSystem = context ? { role: 'system', content: `${system.content}\n\n${buildMemoryBlock(context)}` } : system;
      const inputs = [turnSystem, ...prior, { role: 'user', content: prompt }];
      // Journal approved actions as they complete, so a mid-turn provider
      // failure cannot make already-executed commands disappear from history.
      const checkpoint = shared ? messages => { completed = [...history, { role: 'user', content: prompt }, ...messages.slice(inputs.length)]; } : () => {};
      const execute = createTools({ cwd, approve, signal: active.signal, timeout: 120000 });
      const result = await runTurn({
        messages: inputs,
        request: createRequest(provider, toolDefinitions, active.signal), execute, signal: active.signal,
        onEvent: name => console.error(`  tool: ${safe(name)}`), onCheckpoint: checkpoint
      });
      const nextHistory = shared ? [...history, { role: 'user', content: prompt }, ...result.messages.slice(inputs.length)] : result.messages.slice(1);
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
      console.log(values.json ? JSON.stringify({ response: result.text }) : safe(result.text));
    } catch (error) {
      if (completed && completed.length > history.length) {
        try {
          const recovery = `recovery_${Date.now()}`;
          await saveSession(cwd, recovery, completed);
          console.error(`Completed actions before the failure were saved locally as ${recovery}; do not repeat tool actions blindly.`);
        } catch { /* best effort; surface the original error */ }
      }
      throw error;
    } finally { active = undefined; }
  }
  try {
    if (values.prompt) { await turn(values.prompt); return; }
    console.error(`SwordCLI · ${safe(provider.model)} · ${safe(cwd)}\n/help for commands. Ctrl+C cancels the current turn.`);
    while (!rl.closed) {
      let line;
      try { line = (await rl.question('\nsword> ')).trim(); } catch { break; }
      if (!line) continue;
      if (line === '/exit' || line === '/quit') break;
      if (line === '/help') { console.error(HELP); continue; }
      if (line === '/clear') {
        if (shared) shared = await client.saveMessages(shared.id, [], shared.revision);
        history = [];
        if (values.session) await saveSession(cwd, values.session, history);
        console.error('Conversation cleared.');
        continue;
      }
      if (line.startsWith('/')) { console.error('Unknown command. Use /help.'); continue; }
      try { await turn(line); } catch (error) { console.error(`Error: ${safe(error.message)}`); }
    }
  } finally {
    process.removeListener('SIGINT', cancel);
    rl?.close();
  }
}
main().catch(error => {
  console.error(`SwordCLI: ${safe(error.message)}`);
  process.exitCode = 1;
});
