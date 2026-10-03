// MCP tool dispatch for the CLI: namespaced names, catalog building, and calls.
//
// Two invariants drive the design:
//
// 1. NO SDK AT IMPORT TIME. `@modelcontextprotocol/sdk` is NOT a dependency of
//    this package (it only exists under swordcli/node_modules, which cli/ cannot
//    resolve — see mcpSdkImporter below), so this module must never `import` it
//    statically. Every SDK touch goes through an injectable `importer`, and the
//    no-config path never calls it at all: a user with no .sword/mcp.json pays
//    zero load cost and never sees a MODULE_NOT_FOUND.
//
// 2. NO CALL WITHOUT APPROVAL. MCP tools are arbitrary remote code, so every
//    call routes through the caller's existing `permit` function (the very
//    approval policy createTools uses for run_command/write_file). Approval
//    logic is NEVER reimplemented here: a second policy would drift from the
//    first, and drift in an approval gate is a security hole. Denial short-
//    circuits before any process is spawned.

import { mcpToolName, BUILTIN_TOOL_NAMES } from '../mcpConfig.js';

/** MCP results are re-sent to the model each turn; mirror tools.js TOOL_OUTPUT_CHARS. */
export const MCP_OUTPUT_CHARS = 48000;
export const MCP_CONNECT_TIMEOUT_MS = 15000;
export const MCP_CALL_TIMEOUT_MS = 60000;

/**
 * Builtin tool names, mirrored from cli/tools.js toolDefinitions.
 * tools.js will import THIS module, so importing tools.js back would create a
 * cycle — hence the constant. test/mcp-names.test.js asserts this list still
 * matches toolDefinitions exactly, so drift fails CI instead of shipping.
 */
export const DEFAULT_BUILTINS = new Set(BUILTIN_TOOL_NAMES);

/**
 * Lazy, injectable SDK loader. Deliberately uses a computed specifier so no
 * bundler or static analyser turns this into a hard dependency.
 */
export const mcpSdkImporter = async () => {
  const [client, stdio] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js')
  ]);
  return { Client: client.Client, StdioClientTransport: stdio.StdioClientTransport };
};

const SDK_MISSING = /Cannot find (package|module) '@modelcontextprotocol\/sdk'|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED/;

/** name -> { client, transport, tools } */
const clients = new Map();
/** name -> true ; a dead server is never reconnected and never re-advertised. */
const deadServers = new Set();

export function isServerDead(name) { return deadServers.has(name); }
/** Record a server as unusable; it is dropped from every later catalog. */
export function markServerDead(name) { if (name) deadServers.add(name); }
/** Forget dead-server state (used by tests and after a config reload). */
export function resetDeadServers() { deadServers.clear(); }

/** Close every live client. Safe to call when nothing is connected. */
export async function closeMcpClients() {
  const live = [...clients.values()];
  clients.clear();
  for (const entry of live) {
    try { await entry.transport?.close?.(); } catch { /* already gone */ }
    try { await entry.client?.close?.(); } catch { /* already gone */ }
  }
}

function normaliseSchema(schema) {
  const raw = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : {};
  return {
    type: 'object',
    properties: raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties) ? { ...raw.properties } : {},
    required: Array.isArray(raw.required) ? raw.required.filter(x => typeof x === 'string') : [],
    additionalProperties: raw.additionalProperties === true
  };
}

/** Turn one MCP tool descriptor into the OpenAI-style definition tools.js uses. */
export function mcpToolDefinition(serverName, tool, { builtins = DEFAULT_BUILTINS, used = new Set() } = {}) {
  const name = mcpToolName(serverName, tool.name, { used, builtins });
  const description = String(tool.description || tool.name).slice(0, 900);
  return {
    type: 'function',
    function: {
      name,
      description: `[MCP:${serverName}] ${description}`,
      parameters: normaliseSchema(tool.inputSchema)
    }
  };
}

/** Flat-name prefix shared by every MCP tool: the permit gate keys on this. */
export const MCP_TOOL_PREFIX = 'mcp__';

/** True for model-visible MCP tool names (and nothing else). */
export function isMcpToolName(name) {
  return typeof name === 'string' && name.startsWith(MCP_TOOL_PREFIX);
}

/**
 * Map a flat `mcp__server__tool` name back to its { server, tool } pair.
 * With `servers` (config objects or names) the LONGEST server-prefix wins, so
 * a server literally named `a__b` still resolves; without it the name must
 * split into exactly two parts. Returns null when the name is not an MCP tool
 * or cannot resolve — callers turn that into a model-visible error, never a
 * connection attempt. (Sanitised components never contain `__`, so the split
 * is unambiguous.)
 */
export function parseMcpToolName(name, { servers = [] } = {}) {
  if (!isMcpToolName(name)) return null;
  const rest = name.slice(MCP_TOOL_PREFIX.length);
  const clean = value => String(value ?? '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (Array.isArray(servers) && servers.length) {
    const ranked = servers
      .map(entry => String(entry?.name ?? entry ?? ''))
      .filter(Boolean)
      .map(raw => ({ raw, cleaned: clean(raw) }))
      .filter(({ cleaned }) => cleaned)
      .sort((a, b) => b.cleaned.length - a.cleaned.length);
    for (const { raw, cleaned } of ranked) {
      if (rest !== cleaned && !rest.startsWith(`${cleaned}__`)) continue;
      const tool = rest === cleaned ? '' : rest.slice(cleaned.length + 2);
      if (tool && !tool.includes('__')) return { server: raw, tool };
    }
    return null;
  }
  const parts = rest.split('__');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { server: parts[0], tool: parts[1] };
}

/**
 * Build model-ready definitions for every live server's tools.
 * Dead servers are SKIPPED (never reconnected, never re-advertised); `used`
 * is updated in place so later names avoid every builtin and earlier MCP name.
 * Returns { definitions, toolToServer } — both NEW; inputs untouched.
 */
export function buildMcpCatalog(serversTools, { builtins = DEFAULT_BUILTINS, used = new Set() } = {}) {
  const definitions = [];
  const toolToServer = new Map();
  for (const entry of Array.isArray(serversTools) ? serversTools : []) {
    const serverName = String(entry?.server ?? entry?.name ?? '');
    if (!serverName || isServerDead(serverName)) continue;
    for (const tool of entry?.tools ?? []) {
      if (!tool?.name) continue;
      const definition = mcpToolDefinition(serverName, tool, { builtins, used });
      definitions.push(definition);
      toolToServer.set(definition.function.name, { server: serverName, tool: tool.name });
    }
  }
  return { definitions, toolToServer };
}

/**
 * Race any SDK promise against a timer. Exported so tests can drive the
 * timeout path without spawning a server. The timer is unref'd so a stray
 * pending call never holds the CLI open.
 */
export function withTimeout(promise, ms, label = 'MCP operation') {
  const bounded = Number.isFinite(ms) && ms > 0 ? Math.trunc(ms) : MCP_CALL_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${bounded}ms`)), bounded);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(timer)), timeout]);
}

// Connect (or reuse) one stdio server's SDK client. Lazy: the importer runs
// ONLY here, so a session with no MCP config never touches the SDK.
/** True for names the executor must route sequentially (destructive verbs). */
export function isMcpMutating(toolName, toolId = '') {
  const haystack = `${toolName ?? ''} ${toolId ?? ''}`.toLowerCase();
  return /(^|[^a-z])(delete|destroy|remove|write|edit|create|update|insert|apply|execute|run|publish|deploy|send|post|push|commit|merge|truncate|drop|overwrite|uninstall)([^a-z]|$)/.test(haystack);
}

export async function ensureMcpClient(server, { importer = mcpSdkImporter, timeoutMs = MCP_CONNECT_TIMEOUT_MS } = {}) {
  if (!server?.name || !server?.command) throw new Error(`MCP server "${server?.name ?? '(unnamed)'}" has no command`);
  if (isServerDead(server.name)) throw new Error(`MCP server "${server.name}" is unavailable`);
  const cached = clients.get(server.name);
  if (cached) return cached;
  let sdk;
  try {
    sdk = await withTimeout(importer(), timeoutMs, `MCP SDK import (${server.name})`);
  } catch (error) {
    if (SDK_MISSING.test(error?.message ?? '')) throw new Error('MCP SDK not installed; run: npm install @modelcontextprotocol/sdk');
    throw error;
  }
  const { Client, StdioClientTransport } = sdk ?? {};
  if (typeof Client !== 'function' || typeof StdioClientTransport !== 'function') {
    throw new Error('MCP SDK importer returned an unusable module');
  }
  const env = { ...process.env, ...(server.env ?? {}) };
  const transport = new StdioClientTransport({ command: server.command, args: [...(server.args ?? [])], env, cwd: server.cwd || undefined, stderr: 'ignore' });
  const client = new Client({ name: `sword-cli:${server.name}`, version: '1.0.0' });
  try {
    await withTimeout(client.connect(transport), timeoutMs, `MCP connect (${server.name})`);
    const listed = await withTimeout(client.listTools(), timeoutMs, `MCP listTools (${server.name})`);
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    const entry = { client, transport, tools };
    clients.set(server.name, entry);
    return entry;
  } catch (error) {
    try { await transport?.close?.(); } catch { /* already gone */ }
    try { await client?.close?.(); } catch { /* already gone */ }
    markServerDead(server.name);
    throw error;
  }
}

/** Truncate an MCP result like tools.js does (head+tail, quadratic cap). */
export function truncateMcpOutput(value, max = MCP_OUTPUT_CHARS) {
  const body = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (body.length <= max) return body;
  const notice = chars => `\n[truncated ${chars} chars \u2014 head and tail preserved]\n`;
  const half = Math.max(1, Math.floor((max - notice(body.length).length) / 2));
  return `${body.slice(0, half)}${notice(body.length - half * 2)}${body.slice(-half)}`;
}

/**
 * Dispatch one flat MCP tool call. THE permit gate lives here:
 * permit({ tool, server, tool: toolId, args }) runs BEFORE any connect or
 * spawn; anything but an explicit `true` is a denial and NOT a tool failure
 * (the model must clarify, not retry). Unknown names, unknown servers, dead
 * servers and timeouts all return { error } payloads — never throw — except a
 * permit DENIAL, which throws the caller's denial error verbatim so Phase 2's
 * executor keeps its deny-vs-failure distinction. Returns a NEW object.
 */
export async function dispatchMcpCall(name, args, { servers = [], permit = null, importer = mcpSdkImporter, connectTimeoutMs = MCP_CONNECT_TIMEOUT_MS, callTimeoutMs = MCP_CALL_TIMEOUT_MS } = {}) {
  const parsed = parseMcpToolName(name, { servers });
  if (!parsed) return { error: `Unknown MCP tool: ${name}` };
  const server = (Array.isArray(servers) ? servers : []).find(s => s?.name === parsed.server);
  if (!server) return { error: `Unknown MCP server: ${parsed.server}` };
  if (server.disabled === true) return { error: `MCP server "${parsed.server}" is disabled` };
  if (isServerDead(parsed.server)) return { error: `MCP server "${parsed.server}" is unavailable` };
  if (typeof permit !== 'function') return { error: `MCP tool "${name}" requires explicit approval (no permit function)` };
  let allowed;
  try {
    allowed = await permit({ tool: name, server: parsed.server, toolId: parsed.tool, args });
  } catch (error) {
    throw error; // a permit denial keeps its verbatim denial error
  }
  if (allowed !== true) return { error: 'Action denied by user. NOT a tool or system failure \u2014 clarify with the user before retrying.' };
  let entry;
  try {
    entry = await ensureMcpClient(server, { importer, timeoutMs: connectTimeoutMs });
  } catch (error) {
    return { error: `MCP server "${parsed.server}" unavailable: ${error?.message ?? error}` };
  }
  const descriptor = entry.tools.find(t => t?.name === parsed.tool);
  if (!descriptor) return { error: `Unknown MCP tool "${parsed.tool}" on server "${parsed.server}"` };
  try {
    const raw = await withTimeout(entry.client.callTool({ name: parsed.tool, arguments: args ?? {} }), callTimeoutMs, `MCP call ${name}`);
    const content = Array.isArray(raw?.content)
      ? raw.content.map(part => (typeof part?.text === 'string' ? part.text : JSON.stringify(part))).join('\n')
      : JSON.stringify(raw ?? null);
    return { content: truncateMcpOutput(content), ...(raw?.isError ? { isError: true } : {}) };
  } catch (error) {
    return { error: `MCP call ${name} failed: ${error?.message ?? error}` };
  }
}
