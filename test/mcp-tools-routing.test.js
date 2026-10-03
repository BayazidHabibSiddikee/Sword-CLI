import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools } from '../cli/tools.js';
import { resetDeadServers } from '../cli/mcp/dispatch.js';

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'mcp-route-'));
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

test('an mcp__ tool with no servers configured reports that, without throwing', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    const run = createTools({ cwd, approve: async () => true, mcpServers: null });
    const result = await run('mcp__alpha__read', { x: 1 });
    assert.match(result.error, /No MCP servers/);
  } finally { await cleanup(); }
});

test('an mcp__ tool with servers configured reaches the dispatcher and fails gracefully', async () => {
  resetDeadServers();
  const { cwd, cleanup } = await fixture();
  try {
    const run = createTools({
      cwd, approve: async () => true,
      // A real config; the SDK is not installed at the root, so the dispatcher
      // must return an error PAYLOAD (graceful), never throw, and never touch
      // built-in tools.
      mcpServers: [{ name: 'alpha', command: 'echo', args: [], env: {}, cwd: '', url: '' }],
    });
    const result = await run('mcp__alpha__read', { x: 1 });
    // Either an availability error (SDK missing / dead server) — the key point is
    // it is a returned { error } object, not a thrown exception.
    assert.equal(typeof result, 'object');
    assert.ok('error' in result, `expected an error payload, got ${JSON.stringify(result)}`);
  } finally {
    resetDeadServers();
    await cleanup();
  }
});
