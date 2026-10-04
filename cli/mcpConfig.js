// MCP configuration discovery, secret expansion and redaction.
//
// Upstream MCP clients disagree on the config file's SHAPE, so both are accepted:
//   - VS Code / Cursor style: { "mcpServers": { "name": { command, args, env } } }
//   - Claude-Code / swordcli style: { "servers": [ { name, command, args, env } ] }
// The server's own loader (swordcli/server/src/agent/mcp-client.ts) reads ONLY
// `servers` and silently ignores `mcpServers`, while the repo's shipped config
// (swordcli/mcp-configs/freellmapi-rag.json) uses `mcpServers` — so either shape
// must load here.
//
// Search order is project-then-home, because a project config is a deliberate
// per-repo choice and must win over a machine-wide one.
//
// Security: a malformed file is never fatal (a typo in ~/.config must not break
// every session in the project) — it is collected into `errors[]` and the search
// continues. Secrets are expanded ONLY on explicit request, and `redactConfig`
// is the only thing allowed to serialise a loaded config for display/logging.

import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/** Project-local config, relative to the session cwd. */
export const PROJECT_CONFIG_REL = join('.sword', 'mcp.json');
/** Machine-wide config, relative to the home directory. */
export const HOME_CONFIG_REL = join('.config', 'sword', 'mcp.json');
export const REDACTED = '***redacted***';

/**
 * Canonical builtin tool names (mirrors cli/tools.js toolDefinitions).
 * dispatch.js re-exports these as DEFAULT_BUILTINS so tools.js never needs a
 * back-import; test/mcp-names.test.js asserts the lists stay identical.
 */
export const BUILTIN_TOOL_NAMES = Object.freeze([
  'list_files', 'read_file', 'search_files', 'write_file', 'edit_file',
  'apply_patch', 'run_command', 'save_to_rag', 'read_pdf', 'fetch_web',
  'fetch_web_rendered', 'web_search', 'load_skill', 'task',
  'download_book', 'send_email', 'read_email', 'telegram_send', 'telegram_get_updates',
  'create_character', 'upload_knowledge', 'list_characters', 'delete_character', 'export_character',
  'character_memory_save', 'character_memory_load', 'character_memory_search',
  'character_watch_files', 'character_chat', 'character_chat_history',
  'character_task_add', 'character_task_list', 'character_task_update',
  'character_task_remove', 'character_task_process'
]);

// Key names whose values are credentials. Matched case-insensitively, and also
// against the flattened path (e.g. `env.GITHUB_TOKEN`).
const SECRET_KEY = /(token|secret|password|passwd|api[-_ ]?key|apikey|authorization|auth[-_ ]?token|credential|private[-_ ]?key|access[-_ ]?key|bearer)/i;
// Value shapes that are credentials regardless of the key they sit under — a
// token pasted straight into `env` under a harmless name must still not print.
const SECRET_VALUE = /^(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})$/;

/**
 * Candidate config paths in priority order (project first, then home).
 * Never returns duplicates, and never returns a home path when HOME is unset —
 * a bare relative path would resolve against cwd and silently re-read the
 * project file as the "machine-wide" one.
 */
export function mcpConfigPaths({ cwd = process.cwd(), env = process.env, home = null } = {}) {
  const paths = [join(resolve(cwd), PROJECT_CONFIG_REL)];
  const base = home ?? env?.HOME ?? env?.USERPROFILE ?? safeHomedir();
  if (base) {
    const homePath = join(resolve(base), HOME_CONFIG_REL);
    if (homePath !== paths[0]) paths.push(homePath);
  }
  return paths;
}

function safeHomedir() {
  try { return homedir(); } catch { return ''; }
}

/**
 * Replace `${env:VAR}` with the environment value. An unset variable expands to
 * an empty string rather than the literal `${env:VAR}`: passing the placeholder
 * through would ship a broken (and misleading) value to a child process.
 * Returns a NEW value; the input is never mutated.
 */
export function expandSecrets(value, env = process.env, onMissing = null) {
  if (typeof value === 'string') {
    return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name) => {
      const found = env?.[name];
      if (found === undefined || found === null) {
        onMissing?.(name);
        return '';
      }
      return String(found);
    });
  }
  if (Array.isArray(value)) return value.map(item => expandSecrets(item, env, onMissing));
  // Only plain objects are rebuilt; a Date/Buffer is passed through untouched.
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandSecrets(v, env, onMissing)]));
  }
  return value;
}

/**
 * Deep copy of a config with every credential replaced by REDACTED.
 * This is the ONLY sanctioned way to print/log a loaded config: serialising the
 * result must be safe with no further filtering.
 */
export function redactConfig(value, keyPath = []) {
  if (typeof value === 'string') {
    const key = keyPath[keyPath.length - 1] ?? '';
    return SECRET_KEY.test(key) || SECRET_VALUE.test(value) ? REDACTED : value;
  }
  if (Array.isArray(value)) return value.map((item, i) => redactConfig(item, [...keyPath, String(i)]));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      // A key naming a credential redacts its whole subtree, so a nested
      // `{ headers: { Authorization: ... } }` cannot leak via the value test.
      if (SECRET_KEY.test(k)) return [k, REDACTED];
      return [k, redactConfig(v, [...keyPath, k])];
    }));
  }
  return value;
}

/** Coerce one raw entry into a frozen { name, command, args, env, cwd, url }. */
function normaliseServer(name, raw, errors, sourceLabel) {
  const where = `${sourceLabel}:${name || '(unnamed)'}`;
  if (!isPlainObject(raw)) { errors.push(`${where} is not an object`); return null; }
  const serverName = String(raw.name ?? name ?? '').trim();
  if (!serverName) { errors.push(`${where} has no name`); return null; }
  const command = typeof raw.command === 'string' && raw.command.trim() ? raw.command.trim() : '';
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : '';
  if (!command && !url) { errors.push(`${where} has neither "command" nor "url"`); return null; }
  if (raw.args !== undefined && !Array.isArray(raw.args)) { errors.push(`${where} has a non-array "args"`); return null; }
  if (raw.env !== undefined && !isPlainObject(raw.env)) { errors.push(`${where} has a non-object "env"`); return null; }
  return Object.freeze({
    name: serverName,
    command,
    args: Object.freeze((raw.args ?? []).map(String)),
    env: Object.freeze({ ...(raw.env ?? {}) }),
    cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
    url,
    disabled: raw.disabled === true
  });
}

/**
 * Flatten both accepted shapes into one ordered, de-duplicated server list.
 * `servers` is read first (array or map), then `mcpServers` (array or map); a
 * duplicate name keeps the first definition and records a note, because two
 * servers sharing one name is a config bug rather than an intent to override.
 */
export function normaliseServers(parsed) {
  const errors = [];
  const servers = [];
  const seen = new Set();
  const add = (name, raw, label) => {
    const server = normaliseServer(name, raw, errors, label);
    if (!server) return;
    if (seen.has(server.name)) { errors.push(`duplicate server name "${server.name}" ignored (${label})`); return; }
    seen.add(server.name);
    servers.push(server);
  };
  for (const [label, value] of [['servers', parsed?.servers], ['mcpServers', parsed?.mcpServers]]) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const entry of value) add(entry?.name, entry, label);
    else if (isPlainObject(value)) for (const [name, entry] of Object.entries(value)) add(name, entry, label);
    else errors.push(`${label} must be an array or an object map`);
  }
  return { servers, errors };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/**
 * Load the effective MCP config, or null when no config file exists anywhere.
 *
 * Returns { servers, path, errors }:
 *   - `path` is the file that produced `servers` (the first candidate with a
 *     usable server; if every existing candidate was broken, the first seen).
 *   - `errors` describes every rejected candidate AND every rejected entry, from
 *     ALL candidates — a broken project file stays reportable even when a
 *     working home file wins.
 * Never throws for bad input; `null` means "no config file exists".
 */
export function loadMcpConfig({ cwd = process.cwd(), env = process.env, paths = null, secrets = false } = {}) {
  const candidates = paths ?? mcpConfigPaths({ cwd, env });
  const errors = [];
  let firstSeen = null;
  let servers = null;
  let path = null;
  for (const candidate of candidates) {
    if (!isFile(candidate)) continue;
    firstSeen ??= candidate;
    let raw;
    try { raw = readFileSync(candidate, 'utf8'); }
    catch (error) { errors.push({ path: candidate, message: `unreadable: ${error.message}` }); continue; }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (error) { errors.push({ path: candidate, message: `invalid JSON: ${error.message}` }); continue; }
    if (!isPlainObject(parsed)) { errors.push({ path: candidate, message: 'top level must be a JSON object' }); continue; }
    const result = normaliseServers(parsed);
    for (const message of result.errors) errors.push({ path: candidate, message });
    // The highest-priority file that yields ANY usable server wins outright; a
    // lower-priority file must not merge in and silently enable a machine-wide
    // server for this project.
    if (servers === null && result.servers.length) { servers = result.servers; path = candidate; }
    else if (servers === null && path === null) { servers = []; path = candidate; }
  }
  if (!firstSeen) return null;
  if (secrets) servers = servers.map(s => ({ ...s, env: expandSecrets(s.env, env), args: expandSecrets(s.args, env) }));
  return { servers: servers ?? [], path, errors };
}

/** True when a server entry is enabled and has a usable transport. */
export function isUsableServer(server) {
  return Boolean(server) && server.disabled !== true && Boolean(server.command || server.url);
}

/**
 * Map one MCP (server, tool) pair to the model's flat tool name.
 * Shape `mcp__<server>__<tool>` (sanitised to [a-z0-9_], max 64 chars): the
 * `__` separators + server scope let a reviewer see exactly which remote
 * server a call targets, and keep two servers' same-named tools distinct.
 * `used` avoids collisions with builtins and earlier names; `builtins` is
 * injectable so tests never import tools.js (which would cycle).
 */
export function mcpToolName(serverName, toolName, { used = null, builtins = null } = {}) {
  const clean = value => String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'tool';
  const server = clean(serverName);
  const tool = clean(toolName);
  const taken = name =>
    (builtins instanceof Set ? builtins.has(name) : Array.isArray(builtins) ? builtins.includes(name) : false) ||
    (used instanceof Set ? used.has(name) : used instanceof Map ? used.has(name) : Array.isArray(used) ? used.includes(name) : false);
  let candidate = `mcp__${server}__${tool}`.slice(0, 64);
  if (!taken(candidate)) {
    if (used instanceof Set) used.add(candidate);
    return candidate;
  }
  let suffix = 2;
  while (taken(`${candidate.slice(0, 61)}_${suffix}`)) suffix++;
  const unique = `${candidate.slice(0, 61)}_${suffix}`;
  if (used instanceof Set) used.add(unique);
  return unique;
}

/** Optional alias map: { alias: 'server.tool' | 'server/tool' | { server, tool } }. */
export function resolveToolAlias(alias, { aliases = null, servers = [] } = {}) {
  if (typeof alias !== 'string' || !alias.trim()) return null;
  const key = alias.trim();
  const direct = aliases && typeof aliases === 'object' && !Array.isArray(aliases) ? aliases[key] : undefined;
  const target = direct === undefined ? key : direct;
  let server = null;
  let tool = null;
  if (typeof target === 'string') {
    const parts = target.includes('/') ? target.split('/') : target.split('.');
    if (parts.length === 2) [server, tool] = parts.map(p => p.trim());
  } else if (target && typeof target === 'object') {
    server = String(target.server ?? '').trim() || null;
    tool = String(target.tool ?? '').trim() || null;
  }
  if (!server || !tool) return null;
  if (Array.isArray(servers) && servers.length && !servers.includes(server)) return null;
  return { server, tool };
}

/** Server list that is safe to print: no command-time secret survives this. */
export function describeServers(config) {
  if (!Array.isArray(config?.servers)) return [];
  return config.servers.map(s => redactConfig({ ...s }));
}

/** Compact one-line summary for /status: never includes a command line's env. */
export function describeConfigSummary(config) {
  if (!config?.servers?.length) return null;
  const redacted = describeServers(config);
  return redacted.map(s => `${s.name} (${s.disabled ? 'disabled' : s.command ? 'stdio' : 'http'}${s.args?.length ? `, ${s.args.length} args` : ''})`);
}
