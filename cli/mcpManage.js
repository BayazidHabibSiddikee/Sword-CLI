// `mcp` subcommand: a proper way to CONNECT to MCP servers, not just read config.
//
// Hand-editing .sword/mcp.json is how you used to do it; this replaces that with
// real commands:
//
//   sword mcp add <name> <command> [args...] [--env K=V]... [--url U] [--global] [--cwd DIR]
//   sword mcp remove <name> [--global] [--cwd DIR]
//   sword mcp list [--cwd DIR]
//   sword mcp test <name> [--global] [--cwd DIR]   // actually connect + list tools
//   sword mcp show [name] [--global] [--cwd DIR]   // redacted detail
//   sword mcp help
//
// Design notes:
//   - WRITES preserve the file's existing shape (mcpServers map vs servers array)
//     so a managed file is never silently re-shaped out from under another tool.
//   - READS go through loadMcpConfig so secret expansion / redaction stay in ONE
//     place (mcpConfig.js); `list` and `show` never print a raw credential.
//   - `test` is the connect proof: it runs the exact ensureMcpClient() path the
//     agent uses, so "it connected and listed N tools" here means the same
//     thing the model will see at session start.
//
// This module owns no network/session state; it returns a process exit code and
// prints to stdout/stderr so it is safe to run headless.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import {
  loadMcpConfig, mcpConfigPaths, PROJECT_CONFIG_REL, HOME_CONFIG_REL,
  redactConfig, isUsableServer,
} from './mcpConfig.js';
import { ensureMcpClient, closeMcpClients, resetDeadServers, MCP_CONNECT_TIMEOUT_MS } from './mcp/dispatch.js';

const HELP = `sword mcp — connect and manage MCP servers

  mcp add <name> <command> [args...]
        Register a stdio MCP server. Repeat --env K=V for environment variables
        (values may use \${env:VAR} for secret expansion). --url U registers an
        http/sse server instead. Flags:
          --env K=V     environment variable for the server (repeatable)
          --url URL     http/sse endpoint instead of a command
          --global      write the machine-wide config (~/.config/sword/mcp.json)
          --cwd DIR     write DIR/.sword/mcp.json instead of the current directory
          --disabled    store it without enabling it
  mcp remove <name> [--global | --cwd DIR]
  mcp list   [--cwd DIR]            show every server across project + global scopes
  mcp test   <name> [--global | --cwd DIR]
        Connect to the server and list its tools (the same path the agent uses).
  mcp show   [name] [--global | --cwd DIR]   redacted server detail
  mcp help

The agent reads project config first, then global. After \`mcp add\`, start a new
session (or the server is picked up automatically at the next one).`;

/** Parse the tail of one mcp subcommand into positionals + known flags. */
function parseFlags(rest) {
  const positionals = [];
  const env = [];
  const flags = { global: false, disabled: false, help: false, cwd: null, url: null };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => {
      const v = rest[++i];
      if (v === undefined || (v.startsWith('-') && v !== '-')) throw new Error(`missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case '--global': flags.global = true; break;
      case '--disabled': flags.disabled = true; break;
      case '--help': case '-h': flags.help = true; break;
      case '--cwd': flags.cwd = next(); break;
      case '--url': flags.url = next(); break;
      case '--env': {
        const kv = next();
        const eq = kv.indexOf('=');
        if (eq <= 0) throw new Error(`--env needs KEY=VALUE (got "${kv}")`);
        env.push({ key: kv.slice(0, eq), value: kv.slice(eq + 1) });
        break;
      }
      case '--': for (let j = i + 1; j < rest.length; j++) positionals.push(rest[j]); i = rest.length; break;
      default:
        if (arg.startsWith('--')) throw new Error(`unknown flag: ${arg}`);
        positionals.push(arg);
    }
  }
  return { positionals, env, ...flags };
}

/** Resolve the target config file path for a scope. */
function targetPath({ cwd, global, env = process.env, home = null }) {
  const base = global
    ? (home ?? env?.HOME ?? env?.USERPROFILE ?? safeHome())
    : resolve(cwd || process.cwd());
  const rel = global ? HOME_CONFIG_REL : PROJECT_CONFIG_REL;
  return join(base, rel);
}
function safeHome() { try { return homedir(); } catch { return ''; } }

/** Read + parse a config file, or {} when absent. Never throws for a missing file. */
function readConfigRaw(path) {
  if (!existsSync(path)) return { __new: true, data: {} };
  const text = readFileSync(path, 'utf8');
  if (!text.trim()) return { data: {} };
  const parsed = JSON.parse(text); // a corrupt file is a real error the user must fix
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`not a JSON object: ${path}`);
  return { data: parsed };
}

function writeConfigRaw(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Locate the container a server lives in and (de)serialize one entry,
 * preserving whichever shape the file already uses. Returns the key into
 * `data` ('mcpServers' | 'servers') plus whether it was newly created.
 */
function serverContainer(data, name) {
  if (data.mcpServers && typeof data.mcpServers === 'object' && !Array.isArray(data.mcpServers)) return { key: 'mcpServers', map: data.mcpServers, shape: 'map' };
  if (Array.isArray(data.servers)) return { key: 'servers', map: data.servers, shape: 'array' };
  if (data.servers && typeof data.servers === 'object') return { key: 'servers', map: data.servers, shape: 'map' };
  data.mcpServers = {};
  return { key: 'mcpServers', map: data.mcpServers, shape: 'map' };
}

function addServer(data, name, { command, args, env, url, disabled }) {
  const c = serverContainer(data, name);
  const entry = {};
  if (url) entry.url = url;
  if (command) entry.command = command;
  if (args?.length) entry.args = args;
  if (env?.length) entry.env = Object.fromEntries(env.map(e => [e.key, e.value]));
  if (disabled) entry.disabled = true;
  if (c.shape === 'array') {
    const idx = c.map.findIndex(s => s?.name === name);
    const record = { name, ...entry };
    if (idx >= 0) c.map[idx] = { ...c.map[idx], ...record };
    else c.map.push(record);
    return idx >= 0;
  }
  // map shape
  const replaced = Boolean(c.map[name]);
  c.map[name] = { ...(c.map[name] ?? {}), ...entry };
  if (c.key === 'servers') delete c.map[name].name; // map keys already carry the name
  return replaced;
}

function removeServer(data, name) {
  const c = serverContainer(data, name);
  if (c.shape === 'array') {
    const idx = c.map.findIndex(s => s?.name === name);
    if (idx >= 0) { c.map.splice(idx, 1); return true; }
    return false;
  }
  if (c.key === 'servers') { delete c.map[name]?.name; }
  const removed = delete c.map[name];
  return removed;
}

// ── subcommand handlers ───────────────────────────────────────────────────────

async function cmdAdd(argv) {
  const { positionals, env, global, cwd, url, disabled } = parseFlags(argv);
  const name = positionals[0];
  const command = positionals[1];
  const args = positionals.slice(2);
  if (!name || (!command && !url)) {
    console.error('usage: mcp add <name> <command> [args...] [--env K=V] [--url U] [--global] [--cwd DIR] [--disabled]');
    return 2;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    console.error(`server name must match [A-Za-z0-9._-] (got "${name}")`);
    return 2;
  }
  const target = targetPath({ cwd, global });
  const { data } = readConfigRaw(target);
  const replaced = addServer(data, name, { command, args, env, url, disabled });
  writeConfigRaw(target, data);
  console.log(`${replaced ? 'Updated' : 'Added'} MCP server "${name}" ${disabled ? '(disabled) ' : ''}→ ${target}`);
  console.log('Start a new session to load it, or run:  mcp test ' + name);
  return 0;
}

async function cmdRemove(argv) {
  const { positionals, global, cwd } = parseFlags(argv);
  const name = positionals[0];
  if (!name) { console.error('usage: mcp remove <name> [--global | --cwd DIR]'); return 2; }
  const target = targetPath({ cwd, global });
  if (!existsSync(target)) { console.error(`no config at ${target}; nothing to remove`); return 1; }
  const { data } = readConfigRaw(target);
  const removed = removeServer(data, name);
  if (!removed) { console.error(`"${name}" not found in ${target}`); return 1; }
  writeConfigRaw(target, data);
  console.log(`Removed MCP server "${name}" from ${target}`);
  return 0;
}

function listScope(label, config) {
  const rows = (config?.servers ?? []).map(s => ({
    name: s.name,
    status: s.disabled ? 'disabled' : s.command ? 'stdio' : 'http',
    transport: s.command ? `${s.command} ${s.args?.length ? `\u0060${s.args.join(' ')}\u0060` : ''}` : (s.url ?? ''),
    env: Object.keys(redactConfig(s.env ?? {})).length,
  }));
  if (!config || !config.servers.length) { console.log(`  (${label}) ${config ? 'no servers' : 'no config'}`); return; }
  console.log(`  ${label} — ${config.path}`);
  for (const r of rows) {
    const secret = r.env ? ` · ${r.env} env (redacted)` : '';
    console.log(`    ${r.name.padEnd(20)} ${r.status}  ${r.transport}${secret}`);
  }
}

async function cmdList(argv) {
  const { cwd } = parseFlags(argv);
  // cwd is null when --cwd is not supplied; mcpConfigPaths calls resolve() which
  // throws ERR_INVALID_ARG_TYPE on null — fall back to the process working directory.
  const effectiveCwd = cwd ?? process.cwd();
  const [projectPath, homePath] = mcpConfigPaths({ cwd: effectiveCwd, env: process.env });
  const project = loadMcpConfig({ cwd: effectiveCwd, env: { HOME: '' }, paths: [projectPath] });
  const global = loadMcpConfig({ cwd: homePath ?? '', env: { HOME: '' }, paths: homePath ? [homePath] : [] });
  console.log('MCP servers:');
  listScope('project', project);
  listScope('global', global);
  return 0;
}

async function cmdTest(argv) {
  const { positionals, global, cwd } = parseFlags(argv);
  const name = positionals[0];
  if (!name) { console.error('usage: mcp test <name> [--global | --cwd DIR]'); return 2; }
  const target = targetPath({ cwd, global });
  const { data } = readConfigRaw(target);
  const { servers, errors } = loadMcpConfig({
    cwd, env: { HOME: global ? '' : process.env.HOME, PATH: process.env.PATH },
    paths: [target], secrets: true,
  });
  if (errors.length) console.error(`[config] ${errors.map(e => e.message).join('; ')}`);
  void data;
  const server = (servers ?? []).find(s => s.name === name);
  if (!server) { console.error(`MCP server "${name}" not found in ${target}`); return 1; }
  if (server.disabled === true) { console.error(`MCP server "${name}" is disabled`); return 1; }
  if (!server.command) {
    console.error(`MCP server "${name}" uses ${server.url ? 'http/sse' : 'an unsupported'} transport — the CLI currently connects to stdio servers only`);
    return 1;
  }
  resetDeadServers();
  console.error(`[mcp] connecting to "${name}" (${server.command} ${server.args?.join(' ') || ''})…`);
  try {
    const entry = await ensureMcpClient(server, { timeoutMs: MCP_CONNECT_TIMEOUT_MS });
    const tools = (entry.tools ?? []).map(t => t.name);
    console.log(`✔ connected to "${name}" — ${tools.length} tool(s): ${tools.join(', ') || '(none)'}`);
    await closeMcpClients();
    return 0;
  } catch (error) {
    console.error(`✖ "${name}" unavailable: ${error?.message ?? error}`);
    await closeMcpClients().catch(() => {});
    return 1;
  }
}

async function cmdShow(argv) {
  const { positionals, global, cwd } = parseFlags(argv);
  const name = positionals[0] ?? null;
  const target = targetPath({ cwd, global });
  const { data } = readConfigRaw(target);
  const redacted = redactConfig(data);
  if (name) {
    const { servers } = loadMcpConfig({ cwd, env: { HOME: '' }, paths: [target] });
    const found = servers?.find(s => s.name === name);
    if (!found) { console.error(`"${name}" not found in ${target}`); return 1; }
    console.log(JSON.stringify(redactConfig(found), null, 2));
    return 0;
  }
  console.log(`${target}\n` + JSON.stringify(redacted, null, 2));
  return 0;
}

/**
 * Run the mcp subcommand. `argv` may or may not begin with the literal `mcp`
 * token — both `runMcpCommand(['mcp','list'])` and `runMcpCommand(['list'])`
 * work, so both entry points (flow.js, sword.mjs) can pass process.argv.slice(2).
 * Returns a process exit code; printing is done for the caller.
 */
export async function runMcpCommand(argv) {
  const tokens = argv[0] === 'mcp' ? argv.slice(1) : argv;
  const sub = tokens[0];
  const rest = tokens.slice(1);
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') { console.log(HELP); return 0; }
  try {
    switch (sub) {
      case 'add': return await cmdAdd(rest);
      case 'remove': case 'rm': return await cmdRemove(rest);
      case 'list': case 'ls': return await cmdList(rest);
      case 'test': case 'status': return await cmdTest(rest);
      case 'show': return await cmdShow(rest);
      default:
        console.error(`unknown mcp subcommand: ${sub}\n`);
        console.log(HELP);
        return 2;
    }
  } catch (error) {
    console.error(`mcp ${sub}: ${error?.message ?? error}`);
    return 1;
  }
}

export { HELP as MCP_HELP, addServer, removeServer, serverContainer, targetPath, parseFlags };
