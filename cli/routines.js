// Routines: named, standing tasks that run on a schedule or on demand, each run
// recorded with its own output. A portable slice of what a personal-agent host does
// ("fix the code at 2am, run tests, open the PR; every run has its own record"),
// scoped honestly to a CLI:
//   - definitions live in .sword/routines.json (project) or ~/.config/sword (global)
//   - `routine run` is a headless, read-only one-shot turn (safe unattended default)
//   - `routine schedule` GENERATES the cron/systemd line; a CLI does not own a daemon
//   - every run writes .flow/routines/<name>/NNNNNN.json (mode 0600)
//
// The pure store/schedule/record functions are exported and tested independently;
// runRoutineCommand mirrors mcpManage.runMcpCommand (parse -> dispatch -> exit code).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const __dirname = import.meta.dirname; // Node ≥20.6, safe in this project

export const PROJECT_REL = join('.sword', 'routines.json');
export const HOME_REL = join('.config', 'sword', 'routines.json');

const NAMED_SCHEDULES = ['on-demand', 'hourly', 'daily', 'weekdays', 'weekly', 'once'];
const NAMED_CRON = {
  hourly: '0 * * * *',
  daily: '0 6 * * *',
  weekdays: '0 9 * * 1-5',
  weekly: '0 9 * * 1',
};

function safeHome() { try { return homedir(); } catch { return ''; } }

/** Candidate config paths in priority order (project first, then global). */
export function routinesPaths({ cwd = process.cwd(), env = process.env, home = null } = {}) {
  const paths = [join(resolve(cwd), PROJECT_REL)];
  const base = home ?? env?.HOME ?? env?.USERPROFILE ?? safeHome();
  if (base) {
    const homePath = join(resolve(base), HOME_REL);
    if (homePath !== paths[0]) paths.push(homePath);
  }
  return paths;
}

function isPlainObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }

/** Coerce a stored entry into a stable, frozen shape. */
function normalise(raw) {
  const name = String(raw?.name ?? '').trim();
  const prompt = String(raw?.prompt ?? '').trim();
  let schedule = raw?.schedule;
  if (typeof schedule === 'string' && !NAMED_SCHEDULES.includes(schedule)) schedule = 'on-demand';
  if (isPlainObject(schedule) && typeof schedule.cron === 'string') schedule = { cron: schedule.cron, note: schedule.note };
  if (!isPlainObject(schedule)) schedule = NAMED_SCHEDULES.includes(schedule) ? schedule : 'on-demand';
  const tools = Array.isArray(raw?.tools) ? raw.tools.map(String).filter(Boolean) : undefined;
  return Object.freeze({
    name,
    prompt,
    schedule,
    tools,
    created: typeof raw?.created === 'string' ? raw.created : new Date(0).toISOString(),
    lastRun: typeof raw?.lastRun === 'string' ? raw.lastRun : null,
    lastStatus: typeof raw?.lastStatus === 'string' ? raw.lastStatus : null,
  });
}

function readRoutinesFile(path) {
  if (!existsSync(path)) return { routines: [], path };
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return { routines: [], path };
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed?.routines) ? parsed.routines : Array.isArray(parsed) ? parsed : [];
  return { routines: list.filter(r => isPlainObject(r) && r.name).map(normalise), path };
}

/** Load the effective routine list, merging project + global (project first). */
export function loadRoutines({ cwd = process.cwd(), env = process.env, paths = null } = {}) {
  const candidates = paths ?? routinesPaths({ cwd, env });
  const errors = [];
  const seen = new Set();
  const routines = [];
  let path = null;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    path = path ?? candidate;
    try {
      for (const r of readRoutinesFile(candidate).routines) {
        if (seen.has(r.name)) { errors.push(`duplicate routine "${r.name}" in ${candidate} ignored`); continue; }
        seen.add(r.name); routines.push(r);
      }
    } catch (error) { errors.push(`${candidate}: ${error.message}`); }
  }
  return { routines, path, errors };
}

function writeRoutinesFile(path, routines) {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ routines }, null, 2)}\n`, { mode: 0o600 });
}

/** Resolve the target file for add/remove: --cwd DIR | --global | project (cwd). */
function targetPath({ cwd, global, cwdOverride, env = process.env, home = null }) {
  const base = global
    ? (home ?? env?.HOME ?? env?.USERPROFILE ?? safeHome())
    : resolve(cwdOverride || cwd || process.cwd());
  return join(base, global ? HOME_REL : PROJECT_REL);
}

export function addRoutine({ cwd, name, prompt, schedule = 'on-demand', tools = null, global = false, cwdOverride = null, env = process.env, home = null }) {
  if (!/^[A-Za-z0-9._-]+$/.test(name ?? '')) throw new Error(`routine name must match [A-Za-z0-9._-] (got "${name}")`);
  if (!String(prompt ?? '').trim()) throw new Error('routine requires a non-empty --prompt');
  const target = targetPath({ cwd, global, cwdOverride, env, home });
  const existing = readRoutinesFile(target).routines;
  const entry = {
    name, prompt: String(prompt).trim(), schedule,
    ...(tools?.length ? { tools } : {}),
    created: new Date().toISOString(), lastRun: null, lastStatus: null,
  };
  const next = existing.map(r => (r.name === name ? { ...r, ...entry, created: r.created } : r));
  if (!next.some(r => r.name === name)) next.push(entry);
  writeRoutinesFile(target, next);
  return { routine: normalise(entry), path: target, replaced: existing.some(r => r.name === name) };
}

export function removeRoutine({ cwd, name, global = false, cwdOverride = null, env = process.env, home = null }) {
  const target = targetPath({ cwd, global, cwdOverride, env, home });
  if (!existsSync(target)) throw new Error(`no routines at ${target}`);
  const { routines } = readRoutinesFile(target);
  const next = routines.filter(r => r.name !== name);
  if (next.length === routines.length) throw new Error(`routine "${name}" not found in ${target}`);
  writeRoutinesFile(target, next);
  return { removed: name, path: target };
}

/** Named schedule -> cron expression; on-demand/once have none. */
export function scheduleCron(routine) {
  const s = routine?.schedule;
  if (isPlainObject(s) && s.cron) return s.cron;
  if (typeof s === 'string' && NAMED_CRON[s]) return NAMED_CRON[s];
  return null; // on-demand / once / unrecognized -> no cron
}

/** The copy-paste line to install a routine into the OS scheduler. A CLI does not
 * own a daemon, so this generates the command rather than installing it. */
export function scheduleCronLine(routine, { bin = 'sword', cwd = process.cwd() } = {}) {
  const expr = scheduleCron(routine);
  const name = routine?.name;
  if (!name) return null;
  if (!expr) return `# "${name}" is ${routine.schedule === 'once' ? 'a one-shot' : 'on-demand'} — run it manually:  ${bin} routine run ${name}`;
  return `${expr} cd ${cwd} && ${bin} routine run ${name} >> .flow/routines/${name}/cron.log 2>&1`;
}

/** Record one run's output to .flow/routines/<name>/NNNNNN.json (mode 0600). */
export function recordRun({ cwd, name, prompt, status, output, toolCount = null, durationMs = null, exitCode = null }) {
  const dir = join(resolve(cwd), '.flow', 'routines', name);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const index = readdirSync(dir).filter(f => /^\d{6}\.json$/.test(f)).length;
  const record = {
    index, name, prompt, status,
    output: typeof output === 'string' ? output.slice(0, 20000) : JSON.stringify(output ?? null),
    toolCount, durationMs, exitCode, at: new Date().toISOString(),
  };
  const file = join(dir, String(index).padStart(6, '0') + '.json');
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  // Stamp the definition with the freshest run status so `list` can show it.
  const target = targetPath({ cwd, global: false, cwdOverride: null });
  if (existsSync(target)) {
    const { routines } = readRoutinesFile(target);
    writeRoutinesFile(target, routines.map(r => r.name === name ? { ...r, lastRun: record.at, lastStatus: status } : r));
  }
  return { file, index };
}

/** The exact spawn argv a `routine run` would execute (headless, read-only). */
export function runCommandFor(routine, { cwd = process.cwd() } = {}) {
  const cli = join(resolve(__dirname), 'flow.js');
  return { command: process.execPath, args: [cli, '--prompt', routine.prompt, '--json', '--cwd', cwd] };
}

/**
 * Run a routine now: spawn the headless one-shot turn, capture its JSON, and
 * record it. `executor` is injectable (tests pass a stub); `dryRun` returns the
 * command without executing. Read-only by default — unattended mutation is the
 * caller's explicit, separate decision.
 */
export async function runRoutineNow({ cwd, name, dryRun = false, executor = null, bin = 'sword' }) {
  const loaded = loadRoutines({ cwd });
  const routine = loaded.routines.find(r => r.name === name);
  if (!routine) throw new Error(`routine "${name}" not found (no ${PROJECT_REL} or ${HOME_REL} entry)`);
  const cmd = runCommandFor(routine, { cwd });
  if (dryRun) return { dryRun: true, command: cmd.command, args: cmd.args };
  // `executor(cmd) -> stdout` is injectable so tests drive it without a provider.
  // The default spawns the headless one-shot turn and returns its stdout.
  const exec = executor ?? ((c) => {
    const res = spawnSync(c.command, c.args, { encoding: 'utf8', timeout: 300000, env: { ...process.env, SWORD_HEADLESS: '1' } });
    return res.stdout ?? '';
  });
  const startedAt = Date.now();
  const stdout = exec(cmd) ?? '';
  let payload = {};
  try { payload = JSON.parse(stdout || '{}'); } catch { payload = { response: stdout || '(no output)' }; }
  const status = payload.error ? 'error' : (payload.degraded === false ? 'ok' : 'degraded');
  const recorded = recordRun({
    cwd, name, prompt: routine.prompt, status,
    output: payload.response ?? payload.error ?? stdout,
    toolCount: payload.toolsRan ?? null,
    durationMs: Date.now() - startedAt,
    exitCode: typeof payload.degraded !== 'undefined' ? 0 : 1,
  });
  return { status, response: payload.response ?? null, error: payload.error ?? null, toolsRan: payload.toolsRan ?? null, recorded: recorded.file };
}

// ── `routine` subcommand ──────────────────────────────────────────────────────

const HELP = `sword routine — standing, scheduled tasks with a per-run record

  routine add <name> --prompt TEXT [--schedule S] [--tools a,b] [--global] [--cwd DIR]
        S = on-demand | hourly | daily | weekdays | weekly | once | cron:"*/5 * * * *"
  routine list   [--cwd DIR]          every routine, project + global, with last-run status
  routine remove <name> [--global | --cwd DIR]
  routine schedule <name> [--cwd DIR] print the cron line to install (a CLI does not run it)
  routine run <name> [--cwd DIR]      run now (headless, read-only) and record to .flow/routines/<name>/
  routine help

Routines are safe to schedule unattended because "routine run" is read-only by
default (no writes/commands without a TTY). To let a routine run tests or open a
PR, grant the needed tools explicitly and use a non-headless invocation.`;

function parseFlags(rest) {
  const positionals = [];
  const flags = { global: false, cwd: null, tools: null, prompt: null, schedule: 'on-demand', cron: null, help: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = (k) => { const v = rest[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`missing value for ${k}`); return v; };
    switch (a) {
      case '--global': flags.global = true; break;
      case '--help': case '-h': flags.help = true; break;
      case '--cwd': flags.cwd = next('--cwd'); break;
      case '--tools': flags.tools = next('--tools').split(',').map(s => s.trim()).filter(Boolean); break;
      case '--prompt': flags.prompt = next('--prompt'); break;
      case '--schedule': { const v = next('--schedule'); if (v.startsWith('cron:')) flags.cron = v.slice(5); else flags.schedule = v; break; }
      case '--dry-run': flags.dryRun = true; break;
      case '--': for (let j = i + 1; j < rest.length; j++) positionals.push(rest[j]); i = rest.length; break;
      default: if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`); positionals.push(a);
    }
  }
  return { positionals, ...flags };
}

export async function runRoutineCommand(argv, { executor = null } = {}) {
  const tokens = argv[0] === 'routine' ? argv.slice(1) : argv;
  const sub = tokens[0];
  const rest = tokens.slice(1);
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') { console.log(HELP); return 0; }
  try {
    const p = parseFlags(rest);
    switch (sub) {
      case 'add': {
        const name = p.positionals[0];
        if (!name || !p.prompt) { console.error('usage: routine add <name> --prompt TEXT [--schedule S] [--tools a,b] [--global]'); return 2; }
        const r = addRoutine({ cwd: process.cwd(), name, prompt: p.prompt, schedule: p.cron ? { cron: p.cron } : p.schedule, tools: p.tools, global: p.global, cwdOverride: p.cwd });
        console.log(`${r.replaced ? 'Updated' : 'Added'} routine "${name}" → ${r.path}`);
        console.log(`Run now:  sword routine run ${name}`);
        if (scheduleCron(r.routine)) console.log(`Schedule: ${scheduleCronLine(r.routine, { cwd: p.cwd || process.cwd() })}`);
        return 0;
      }
      case 'list': {
        const loaded = loadRoutines({ cwd: p.cwd || process.cwd() });
        if (loaded.errors.length) console.error(loaded.errors.join('\n'));
        if (!loaded.routines.length) { console.log('No routines defined.'); return 0; }
        console.log(`Routines (${loaded.routines.length}):`);
        for (const r of loaded.routines) {
          const last = r.lastRun ? ` · last ${r.lastStatus ?? '?'} @ ${r.lastRun}` : ' · never run';
          const sched = isPlainObject(r.schedule) ? `cron ${r.schedule.cron}` : r.schedule;
          console.log(`  ${r.name.padEnd(20)} ${String(sched).padEnd(12)} ${last}`);
        }
        return 0;
      }
      case 'remove': case 'rm': {
        const name = p.positionals[0];
        if (!name) { console.error('usage: routine remove <name> [--global | --cwd DIR]'); return 2; }
        const r = removeRoutine({ cwd: process.cwd(), name, global: p.global, cwdOverride: p.cwd });
        console.log(`Removed routine "${name}" from ${r.path}`);
        return 0;
      }
      case 'schedule': {
        const name = p.positionals[0];
        if (!name) { console.error('usage: routine schedule <name> [--cwd DIR]'); return 2; }
        const loaded = loadRoutines({ cwd: p.cwd || process.cwd() });
        const r = loaded.routines.find(x => x.name === name);
        if (!r) { console.error(`routine "${name}" not found`); return 1; }
        const line = scheduleCronLine(r, { cwd: p.cwd || process.cwd() });
        console.log('Add to your scheduler (a CLI does not own the daemon):');
        console.log(`  crontab -e`);
        console.log(`  ${line}`);
        return 0;
      }
      case 'run': {
        const name = p.positionals[0];
        if (!name) { console.error('usage: routine run <name> [--cwd DIR] [--dry-run]'); return 2; }
        const result = await runRoutineNow({ cwd: p.cwd || process.cwd(), name, dryRun: p.dryRun, executor });
        if (result.dryRun) { console.log(`would run: ${result.command} ${result.args.join(' ')}`); return 0; }
        console.log(`[${result.status}] routine "${name}" (tools: ${result.toolsRan ?? 'n/a'}) → ${result.recorded}`);
        if (result.response) console.log(String(result.response).slice(0, 400));
        return result.status === 'error' ? 1 : 0;
      }
      default:
        console.error(`unknown routine subcommand: ${sub}\n`);
        console.log(HELP);
        return 2;
    }
  } catch (error) {
    console.error(`routine ${sub}: ${error?.message ?? error}`);
    return 1;
  }
}
