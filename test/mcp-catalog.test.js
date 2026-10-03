import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMcpDefinitions, resetDeadServers, closeMcpClients,
} from '../cli/mcp/dispatch.js';

/** A fake SDK: a Client whose connect()/listTools() return a fixed tool set. */
function fakeSdk(toolNames) {
  const stdio = class StdioClientTransport { constructor(opts) { this.opts = opts; } async close() {} };
  const clientCtor = class Client {
    constructor(meta) { this.meta = meta; }
    async connect() {}
    async listTools() { return { tools: toolNames.map(name => ({ name, description: `d-${name}` })) }; }
    async close() {}
  };
  return { Client: clientCtor, StdioClientTransport: stdio };
}

const servers = [
  { name: 'alpha', command: 'echo', args: [], env: {}, cwd: '', url: '' },
  { name: 'beta', command: 'echo', args: [], env: {}, cwd: '', url: '' },
];

test('collectMcpDefinitions lists tools from every reachable server', async () => {
  resetDeadServers();
  const defs = await collectMcpDefinitions(servers, {
    importer: () => Promise.resolve(fakeSdk(['read', 'write'])),
    connectTimeoutMs: 1000,
  });
  const names = defs.map(d => d.function.name);
  assert.deepEqual(names, ['mcp__alpha__read', 'mcp__alpha__write', 'mcp__beta__read', 'mcp__beta__write']);
  assert.ok(defs.every(d => d.function.name.startsWith('mcp__')));
  await closeMcpClients();
});

test('collectMcpDefinitions skips disabled servers and returns [] with no config', async () => {
  resetDeadServers();
  assert.deepEqual(await collectMcpDefinitions([]), []);
  assert.deepEqual(await collectMcpDefinitions(null), []);
  const defs = await collectMcpDefinitions(
    [{ name: 'off', command: 'echo', disabled: true }, { name: 'alpha', command: 'echo' }],
    { importer: () => Promise.resolve(fakeSdk(['read'])), connectTimeoutMs: 1000 },
  );
  assert.deepEqual(defs.map(d => d.function.name), ['mcp__alpha__read'], 'disabled server contributes nothing');
  await closeMcpClients();
});

test('a server whose SDK import fails is skipped without blanking the others', async () => {
  resetDeadServers();
  // First server's importer rejects (mimics "SDK not installed"); second succeeds.
  let calls = 0;
  const defs = await collectMcpDefinitions(
    [
      { name: 'broken', command: 'echo' },
      { name: 'good', command: 'echo' },
    ],
    {
      importer: async () => {
        calls += 1;
        if (calls === 1) { const e = new Error("Cannot find package '@modelcontextprotocol/sdk'"); throw e; }
        return fakeSdk(['ping']);
      },
      connectTimeoutMs: 1000,
    },
  );
  assert.deepEqual(defs.map(d => d.function.name), ['mcp__good__ping'], 'one dead server must not drop the rest');
  await closeMcpClients();
  resetDeadServers();
});
