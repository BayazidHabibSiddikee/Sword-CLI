#!/usr/bin/env node
// sword — unified SwordCLI launcher (runs from Characters/ root).
//
// Ensures the whole stack is up before dropping into the agent:
//   1. freeapi       (GET_API/server on :3001 — web UI backend AND cloud provider
//                     registered into sword-server for failover)
//   2. sword-server  (independent minimal backend, /v1 + /api on :3101)
//   3. web UI        (GET_API/client vite dev on :3002, proxies /api+/v1 → :3001)
//   4. agent         (character-flow CLI, tools + approvals + sessions)
//   + ollama         (OPTIONAL local engine on :11434 — only started when
//                     SWORD_START_OLLAMA=1; your API keys cover chat either way)
//
// If sword-server can't come up, the launcher points the CLI straight at
// freeapi :3001 instead.
//
// Usage: ./sword.mjs [agent args...] | ./sword.mjs up|down|status|logs|web|backend
import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SWORD_SERVER_DIR = join(ROOT, 'sword-server');
const BACKEND_DIR = join(ROOT, 'GET_API', 'server');
const WEB_DIR = join(ROOT, 'GET_API', 'client');
const AGENT_JS = join(ROOT, 'cli', 'flow.js');
const PID_DIR = join(ROOT, '.sword');
const API_PORT = process.env.SWORD_API_PORT || '3101';      // independent sword-server
const BACKEND_PORT = process.env.SWORD_BACKEND_PORT || '3001'; // legacy GET_API fallback
const WEB_PORT = process.env.SWORD_WEB_PORT || '3002';

/** Sword-server API token: env first, then the token it minted into its sqlite settings. */
function swordToken() {
  if (process.env.SWORD_TOKEN?.trim()) return process.env.SWORD_TOKEN.trim();
  try {
    // -readonly + a busy timeout: this read races the server's own writes on
    // boot, and a bare `database is locked` failure here silently drops the
    // token — which sends the agent into g4f fallback with no explanation.
    return execSync(`sqlite3 -readonly -cmd \".timeout 2000\" ${join(SWORD_SERVER_DIR, 'data', 'sword.db')} "SELECT value FROM settings WHERE key='api_token';"`, { encoding: 'utf8' }).trim();
  } catch { return ''; }
}

function pidFile(name) { return join(PID_DIR, `${name}.pid`); }
function readPid(name) {
  try {
    const n = Number(readFileSync(pidFile(name), 'utf8').trim());
    return Number.isInteger(n) && n > 0 ? n : null; // empty/0-byte pid files → null
  } catch { return null; }
}
function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
async function backendInfo(port) {
  // Returns { open, hasModels, hasAgent, hasSword } — lets us detect a stale
  // squatter on :3001 that serves HTML but not our API routes.
  const info = { open: false, hasModels: false, hasAgent: false, hasSword: false };
  const get = async (p) => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(4000) });
      return r;
    } catch { return null; }
  };
  const m = await get('/v1/models');
  if (m) {
    info.open = m.status < 500;
    if (m.ok) { try { const b = await m.json(); info.hasModels = Array.isArray(b?.data); } catch {} }
    else if (m.status === 404) {
      // some builds 404 /v1/models but still serve /api — don't call it closed
      info.open = true;
    }
  }
  // /api/agent/tools may require no auth → 200 with envelope; 404 = wrong backend
  const a = await get('/api/agent/tools');
  if (a) { info.hasAgent = a.status !== 404; if (a.status < 500) info.open = true; }
  // /api/sword/* requires the unified key → 401 means route EXISTS (good)
  const s = await get('/api/sword/sessions');
  if (s) { info.hasSword = s.status !== 404; if (s.status < 500) info.open = true; }
  return info;
}
async function portOpen(port, path = '/') {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
    return r.status < 500;
  } catch { return false; }
}
function npmBin() { return process.platform === 'win32' ? 'npm.cmd' : 'npm'; }

async function ensureBackend() {
  // Primary: the independent sword-server on :3101 (plain node, no build step).
  const apiUp = await portOpen(API_PORT, '/health');
  if (apiUp) return 'already-running';
  const pid = readPid('sword-server');
  if (!alive(pid)) {
    if (!existsSync(join(SWORD_SERVER_DIR, 'package.json'))) throw new Error(`sword-server missing: ${SWORD_SERVER_DIR}`);
    mkdirSync(PID_DIR, { recursive: true });
    const out = openSync(join(PID_DIR, 'sword-server.log'), 'a');
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: SWORD_SERVER_DIR, detached: true, stdio: ['ignore', out, out],
      env: { ...process.env, SWORD_PORT: API_PORT, HOST: '127.0.0.1' },
    });
    child.unref();
    writeFileSync(pidFile('sword-server'), String(child.pid));
  }
  for (let i = 0; i < 20; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 1000));
    if (await portOpen(API_PORT, '/health')) return 'started';
  }
  throw new Error(`sword-server did not come up on :${API_PORT}`);
}

/** Legacy GET_API backend on :3001 — started on demand as a fallback only. */
async function ensureLegacyBackend() {
  const info = await backendInfo(BACKEND_PORT);
  if (info.hasAgent || info.hasModels) return 'already-running';
  if (info.open && !info.hasAgent && !info.hasModels) {
    const pid = readPid('backend');
    if (alive(pid)) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    throw new Error(
      `port :${BACKEND_PORT} is held by a process that is NOT the Sword backend ` +
      `(no /v1/models). Find it with: ss -ltnp | grep ${BACKEND_PORT} → kill <pid>, ` +
      `then run: ./sword.mjs up`);
  }
  const pid = readPid('backend');
  if (alive(pid)) return 'already-running';
  if (!existsSync(join(BACKEND_DIR, 'package.json'))) throw new Error(`backend missing: ${BACKEND_DIR}`);
  mkdirSync(PID_DIR, { recursive: true });
  const out = openSync(join(PID_DIR, 'backend.log'), 'a');
  const child = spawn(npmBin(), ['run', 'dev'], {
    cwd: BACKEND_DIR, detached: true, stdio: ['ignore', out, out],
    env: { ...process.env, PORT: BACKEND_PORT, HOST: '127.0.0.1' },
  });
  child.unref();
  writeFileSync(pidFile('backend'), String(child.pid));
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await portOpen(BACKEND_PORT, '/v1/models')) return 'started';
  }
  throw new Error(`backend did not come up on :${BACKEND_PORT}`);
}

async function ensureWeb() {
  if (await portOpen(WEB_PORT, '/')) return 'already-running';
  const pid = readPid('web');
  if (alive(pid)) return 'already-running';
  if (!existsSync(join(WEB_DIR, 'package.json'))) return 'no-web-dir';
  mkdirSync(PID_DIR, { recursive: true });
  const child = spawn(npmBin(), ['exec', 'vite', '--port', WEB_PORT, '--strictPort'], {
    cwd: WEB_DIR, detached: true, stdio: ['ignore', 'ignore', 'ignore'],
  });
  child.unref();
  writeFileSync(pidFile('web'), String(child.pid));
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await portOpen(WEB_PORT, '/')) return 'started';
  }
  return 'starting';
}

async function ensureOllama() {
  // OPTIONAL — the freeapi cloud provider covers chat on its own, so Ollama is
  // not started unless SWORD_START_OLLAMA=1. If an Ollama instance is already
  // up (yours), it's detected and left alone; its provider rows simply fail
  // over to freeapi while it's down.
  if (await portOpen(11434, '/')) return 'already-running';
  if (!/^(1|true|yes|on)$/i.test(process.env.SWORD_START_OLLAMA || '')) return 'skipped';
  let bin = '';
  try { bin = execSync('command -v ollama', { encoding: 'utf8' }).trim(); } catch { /* not installed */ }
  if (!bin) return 'not-installed';
  mkdirSync(PID_DIR, { recursive: true });
  const out = openSync(join(PID_DIR, 'ollama.log'), 'a');
  const child = spawn(bin, ['serve'], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
  writeFileSync(pidFile('ollama'), String(child.pid));
  for (let i = 0; i < 20; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 500));
    if (await portOpen(11434, '/')) return 'started';
  }
  return 'failed';
}

function warnMissingOllamaModels() {
  try {
    const lines = execSync('ollama list', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (lines.length <= 1) console.error('[sword] ollama has no local models — run: ollama pull qwen2.5:1.5b');
  } catch { /* list failed — the freeapi failover still covers chat */ }
}

/** Read a single scalar from a local sqlite DB (best-effort, busy-timeout). */
function sqliteOne(dbPath, sql) {
  try {
    return execSync(`sqlite3 -readonly -cmd ".timeout 2000" '${dbPath}' "${sql}"`, { encoding: 'utf8' }).trim();
  } catch { return ''; }
}

async function freeapiKeyWorks(key) {
  try {
    const r = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/models`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2500),
    });
    if (r.status === 401 || r.status === 403) return false;
    return r.status < 500;
  } catch { return null; }
}

/** Pick the unified key that the LIVE freeapi backend on :3001 actually accepts. */
async function localFreeapiKey() {
  const dbs = [
    join(ROOT, 'GET_API', 'server', 'data', 'freeapi.db'),
    join(ROOT, 'character-flow', 'swordcli', 'server', 'data', 'freeapi.db'),
  ];
  const keys = [];
  for (const db of dbs) {
    if (!existsSync(db)) continue;
    const k = sqliteOne(db, "SELECT value FROM settings WHERE key='unified_api_key';");
    if (k && !keys.includes(k)) keys.push(k);
  }
  for (const k of keys) if (await freeapiKeyWorks(k)) return k;
  return keys[0] || '';
}

/**
 * Register the local freeapi backend as a sword-server provider so chat
 * completions fail over to the 273-model cloud catalog when local Ollama can't
 * answer. sword-server reads the providers table live — no restart needed.
 */
async function registerLocalProvider() {
  const db = join(SWORD_SERVER_DIR, 'data', 'sword.db');
  if (!existsSync(db)) return 'no-sword-db';
  const key = await localFreeapiKey();
  if (!key) return 'no-key';
  const base = `http://127.0.0.1:${BACKEND_PORT}/v1`;
  const safeKey = key.replace(/'/g, "''");
  try {
    execSync(
      `sqlite3 -cmd ".timeout 2000" '${db}' "DELETE FROM providers WHERE name='local-freeapi' OR base_url='${base}';` +
      ` INSERT INTO providers(name, base_url, api_key, model) VALUES('local-freeapi','${base}','${safeKey}','');"`,
      { stdio: 'ignore' }
    );
    return 'registered';
  } catch { return 'failed'; }
}

function stop(name) {
  const pid = readPid(name);
  if (pid && alive(pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
    try { execSync(`pkill -P ${pid} 2>/dev/null`); } catch {}
    console.log(`stopped ${name} (pid ${pid})`);
  } else console.log(`${name}: not running`);
  try { writeFileSync(pidFile(name), ''); } catch {}
}

const cmd = process.argv[2];
if (cmd === 'up') {
  const ollama = await ensureOllama().catch(e => `FAILED: ${e.message}`);
  if (ollama === 'started' || ollama === 'already-running') warnMissingOllamaModels();
  const legacy = await ensureLegacyBackend().catch(e => `FAILED: ${e.message}`);
  console.log(`ollama        ... ${ollama}`);
  console.log(`freeapi :${BACKEND_PORT}  ... ${legacy}`);
  if (!String(legacy).startsWith('FAILED')) console.log(`provider      ... ${await registerLocalProvider().catch(() => 'failed')}`);
  console.log(`sword-server :${API_PORT} ... ${await ensureBackend().catch(e => `FAILED: ${e.message}`)}`);
  console.log(`web          :${WEB_PORT} ... ${await ensureWeb().catch(() => 'skipped')}`);
  process.exit(0);
}
if (cmd === 'down') { stop('web'); stop('sword-server'); stop('backend'); stop('ollama'); process.exit(0); }
if (cmd === 'status') {
  const apiOk = await portOpen(API_PORT, '/health');
  const b = await backendInfo(BACKEND_PORT);
  console.log(`ollama        :11434 open=${await portOpen(11434, '/')} pid=${readPid('ollama') ?? '-'}`);
  console.log(`freeapi       :${BACKEND_PORT} open=${b.open} models=${b.hasModels} agent=${b.hasAgent} pid=${readPid('backend') ?? '-'}`);
  console.log(`sword-server :${API_PORT} health=${apiOk ? 'ok' : 'down'} pid=${readPid('sword-server') ?? '-'}`);
  console.log(`web          :${WEB_PORT} open=${await portOpen(WEB_PORT, '/')} pid=${readPid('web') ?? '-'}`);
  console.log(`agent        : ${AGENT_JS} ${existsSync(AGENT_JS) ? '(found)' : '(MISSING)'}`);
  process.exit(0);
}
if (cmd === 'logs') {
  for (const f of ['ollama.log', 'sword-server.log', 'backend.log', 'web.log']) {
    try { console.log(`--- ${f} ---`); console.log(readFileSync(join(PID_DIR, f), 'utf8').slice(-2000)); }
    catch { console.log(`--- ${f}: (none) ---`); }
  }
  process.exit(0);
}
if (cmd === 'backend') { console.log(`sword-server: ${await ensureBackend()}`); process.exit(0); }
if (cmd === 'web') { console.log(`web: ${await ensureWeb()}`); process.exit(0); }

// ---- powerful agent subcommands (backend-native, no extra deps) ----
// `serve` exposes the backend agent loop directly; `run` = one-shot turn.
const TOKEN = swordToken();
const AUTH = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
if (cmd === 'agent-sessions' || cmd === 'agent-tools' || cmd === 'agent-models') {
  const base = `http://127.0.0.1:${API_PORT}`;
  const get = async (p) => {
    const r = await fetch(`${base}${p}`, { headers: AUTH, signal: AbortSignal.timeout(10000) });
    const t = await r.text();
    console.log(t.slice(0, 4000));
    if (!r.ok) process.exitCode = 1;
  };
  if (cmd === 'agent-sessions') await get('/api/sessions');
  if (cmd === 'agent-tools') await get('/api/tools');
  if (cmd === 'agent-models') await get('/v1/models');
  process.exit(process.exitCode ?? 0);
}
if (cmd === 'agent-new') {
  // ./sword.mjs agent-new <workdir> [title] — create a backend agent session
  const workdir = process.argv[3] || process.cwd();
  const title = process.argv[4] || 'Sword session';
  const r = await fetch(`http://127.0.0.1:${API_PORT}/api/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH },
    body: JSON.stringify({ workdir, title }), signal: AbortSignal.timeout(10000),
  });
  console.log((await r.text()).slice(0, 2000));
  if (!r.ok) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}
if (cmd === 'models') {
  const r = await fetch(`http://127.0.0.1:${API_PORT}/v1/models`, {
    headers: AUTH, signal: AbortSignal.timeout(10000),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(JSON.stringify(b).slice(0, 500)); process.exit(1); }
  for (const m of b?.data ?? []) console.log(`${m.id}  — ${m.name ?? ''}`);
  process.exit(0);
}

// default: full agent run — bring up every background service, then exec the CLI.
//   ollama  → sword-server's native providers (qwen2.5 / marin-tools)
//   freeapi → web UI backend on :3001 AND registered into sword-server as the
//             cloud failover provider, so chat keeps working when the local
//             engine is down or has no models pulled.
// If sword-server itself can't come up, point the CLI straight at freeapi :3001.
const ollamaState = await ensureOllama().catch(e => `FAILED: ${e.message}`);
if (ollamaState === 'started' || ollamaState === 'already-running') warnMissingOllamaModels();
const legacyState = await ensureLegacyBackend().catch(e => `FAILED: ${e.message}`);
if (!String(legacyState).startsWith('FAILED')) {
  const reg = await registerLocalProvider().catch(() => 'failed');
  if (reg !== 'registered') console.error(`[sword] local freeapi provider not registered (${reg})`);
}
let backendState = await ensureBackend().catch(e => `FAILED: ${e.message}`);
let backendPort = API_PORT;
if (String(backendState).startsWith('FAILED')) {
  console.error(`[sword] sword-server ${backendState} — pointing agent at freeapi :${BACKEND_PORT}`);
  backendState = legacyState;
  backendPort = BACKEND_PORT;
}
const webState = await ensureWeb().catch(() => 'skipped');
console.error(
  `[sword] ollama (${ollamaState}) · freeapi :${BACKEND_PORT} (${legacyState}) · ` +
  `backend :${backendPort} (${backendState}) · web :${WEB_PORT} (${webState})`
);
if (String(backendState).startsWith('FAILED')) {
  console.error('[sword] no local backend reachable — agent will use g4f fallback');
}
const args = process.argv.slice(2);
if (!existsSync(AGENT_JS)) { console.error(`[sword] agent missing: ${AGENT_JS}`); process.exit(1); }
const userHasEndpoint = Boolean(process.env.OPENAI_BASE_URL || process.env.PROXY_HOST);
const child = spawn(process.execPath, [AGENT_JS, ...args], {
  stdio: 'inherit', cwd: process.cwd(),
  env: {
    ...process.env,
    // Don't clobber a caller-provided OPENAI_BASE_URL (tests / custom routers);
    // only inject the sword-server endpoint when the user hasn't chosen one.
    ...(userHasEndpoint ? {} : { SWORDCLI_BASE_URL: `http://127.0.0.1:${backendPort}/v1` }),
    // Attach the sword-server token only when we're pointing the CLI at
    // sword-server; other backends manage their own auth (SWORDCLI_ENDPOINT).
    ...(!userHasEndpoint && backendPort === API_PORT
      ? (TOKEN ? { SWORDCLI_TOKEN: TOKEN } : {})
      : (!userHasEndpoint ? { SWORDCLI_ENDPOINT: `http://127.0.0.1:${backendPort}/v1` } : {})),
  },
});
child.on('exit', c => { process.exitCode = c ?? 1; });
