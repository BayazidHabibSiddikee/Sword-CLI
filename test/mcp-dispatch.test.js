// Phase 4 — MCP dispatch: tool naming, the permit gate, lazy SDK import and
// dead-server handling. No real MCP server or SDK is needed: the importer is
// injectable and every path that must NOT touch it is asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolDefinitions } from '../cli/tools.js';
import { mcpToolName, BUILTIN_TOOL_NAMES } from '../cli/mcpConfig.js';
import {
  DEFAULT_BUILTINS, isMcpToolName, parseMcpToolName, buildMcpCatalog, mcpToolDefinition,
  dispatchMcpCall, isMcpMutating, markServerDead, resetDeadServers, withTimeout,
} from '../cli/mcp/dispatch.js';

test('builtin tool names stay in sync with tools.js', () => {
  const fromTools = new Set(toolDefinitions.map(d => d.function.name));
  assert.deepEqual([...DEFAULT_BUILTINS].sort(), [...fromTools].sort());
  assert.deepEqual([...BUILTIN_TOOL_NAMES].sort(), [...fromTools].sort());
});

test('MCP tool names are namespaced, sanitised and never shadow builtins', () => {
  assert.equal(mcpToolName('My Server', 'do.Thing!'), 'mcp__my_server__do_thing');
  assert.ok(isMcpToolName('mcp__a__b'));
  assert.equal(isMcpToolName('read_file'), false);
  // Collision with an existing name gets a numeric suffix, never a replacement.
  const used = new Set(['mcp__alpha__read']);
  const second = mcpToolName('alpha', 'read', { used });
  assert.equal(second, 'mcp__alpha__read_2');
  // A builtin is never allowed to be overwritten by an MCP name.
  const shadow = mcpToolName('alpha', 'read', { builtins: new Set(['mcp__alpha__read']) });
  assert.notEqual(shadow, 'mcp__alpha__read');
});

test('parseMcpToolName round-trips and resolves the longest server prefix', () => {
  assert.deepEqual(parseMcpToolName('mcp__alpha__read'), { server: 'alpha', tool: 'read' });
  assert.equal(parseMcpToolName('read_file'), null);
  assert.equal(parseMcpToolName('mcp__nope'), null);
  // A server whose name sanitises to a name still present in the flat tool name
  // resolves to the RAW server name when the server list is known.
  const flat = mcpToolName('a__b', 'tool');
  assert.equal(flat, 'mcp__a_b__tool', 'components are sanitised (no `__` inside a component)');
  assert.deepEqual(parseMcpToolName(flat, { servers: ['a__b'] }), { server: 'a__b', tool: 'tool' });
});

test('buildMcpCatalog skips dead servers and maps names back to their server', () => {
  resetDeadServers();
  const catalog = buildMcpCatalog([
    { server: 'alpha', tools: [{ name: 'read', description: 'r', inputSchema: { type: 'object' } }] },
    { server: 'beta', tools: [{ name: 'write' }] },
  ]);
  assert.deepEqual(catalog.definitions.map(d => d.function.name), ['mcp__alpha__read', 'mcp__beta__write']);
  assert.deepEqual(catalog.toolToServer.get('mcp__alpha__read'), { server: 'alpha', tool: 'read' });

  markServerDead('alpha');
  const after = buildMcpCatalog([{ server: 'alpha', tools: [{ name: 'read' }] }, { server: 'beta', tools: [{ name: 'write' }] }]);
  assert.deepEqual(after.definitions.map(d => d.function.name), ['mcp__beta__write'], 'a dead server is dropped');
  resetDeadServers();
});

test('a mutating MCP verb is classified for sequential execution', () => {
  assert.equal(isMcpMutating('mcp__db__delete_row', 'delete_row'), true);
  assert.equal(isMcpMutating('mcp__db__list_rows', 'list_rows'), false);
});

test('dispatch requires an explicit permit and never connects when denied', async () => {
  resetDeadServers();
  let imported = 0;
  const importer = async () => { imported += 1; return {}; };
  const servers = [{ name: 'alpha', command: 'noop' }];

  // No permit function at all: refused before any connection attempt.
  const noPermit = await dispatchMcpCall('mcp__alpha__read', {}, { servers, importer });
  assert.match(noPermit.error, /requires explicit approval/);

  // A permit that returns non-true is a DENIAL, not a tool failure.
  const denied = await dispatchMcpCall('mcp__alpha__read', {}, { servers, importer, permit: async () => false });
  assert.match(denied.error, /Action denied by user/);

  // A permit that THROWS keeps its verbatim error (the deny-vs-failure distinction).
  await assert.rejects(
    dispatchMcpCall('mcp__alpha__read', {}, { servers, importer, permit: async () => { throw new Error('denied-by-policy'); } }),
    /denied-by-policy/,
  );

  assert.equal(imported, 0, 'the SDK importer is never reached when a call is refused');
});

test('an unknown MCP name or server is refused without importing the SDK', async () => {
  let imported = 0;
  const importer = async () => { imported += 1; return {}; };
  assert.match((await dispatchMcpCall('read_file', {}, { servers: [], importer })).error, /Unknown MCP tool/);
  assert.match((await dispatchMcpCall('mcp__ghost__read', {}, { servers: [], importer })).error, /Unknown MCP server/);
  assert.equal(imported, 0);
});

test('mcpToolDefinition tags the description with its server and normalises the schema', () => {
  const def = mcpToolDefinition('alpha', { name: 'read', description: 'reads', inputSchema: { properties: { path: { type: 'string' } }, required: ['path'] } });
  assert.equal(def.function.name, 'mcp__alpha__read');
  assert.match(def.function.description, /^\[MCP:alpha\]/);
  assert.deepEqual(def.function.parameters.required, ['path']);
  assert.equal(def.function.parameters.additionalProperties, false);
});

test('withTimeout rejects a hung SDK promise instead of hanging the turn', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'mcp call'), /mcp call timed out/);
  assert.equal(await withTimeout(Promise.resolve('ok'), 1000), 'ok');
});
