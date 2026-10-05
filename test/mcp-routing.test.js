import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools } from '../cli/tools.js';
import { runTurn } from '../cli/agent.js';
import { resetDeadServers } from '../cli/mcp/dispatch.js';

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'mcp-routing-test-'));
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}

test('createTools attaches run.mcp and handles missing mcpServers gracefully', async () => {
  const { cwd, cleanup } = await fixture();
  try {
    const run = createTools({ cwd, approve: async () => true, mcpServers: null });
    assert.equal(typeof run.mcp, 'function', 'run.mcp must be defined as a function on tool runner');
    const result = await run.mcp('mcp__alpha__read', { path: 'test.txt' });
    assert.equal(typeof result, 'object');
    assert.match(result.error, /No MCP servers are configured/);
  } finally {
    await cleanup();
  }
});

test('createTools attaches run.mcp and routes to dispatchMcpCall when servers are configured', async () => {
  resetDeadServers();
  const { cwd, cleanup } = await fixture();
  try {
    const run = createTools({
      cwd,
      approve: async () => true,
      mcpServers: [{ name: 'alpha', command: 'echo', args: [], env: {}, cwd: '', url: '' }]
    });
    assert.equal(typeof run.mcp, 'function', 'run.mcp must be defined as a function on tool runner');
    const result = await run.mcp('mcp__alpha__read', { x: 1 });
    assert.equal(typeof result, 'object');
    assert.ok('error' in result, 'dispatcher returns error payload for uninstalled SDK rather than throwing');
    assert.ok(!result.error.includes('No MCP servers are configured'));
  } finally {
    resetDeadServers();
    await cleanup();
  }
});

test('runTurn routes mcp tool calls through execute.mcp without throwing Unknown tool error', async () => {
  let mcpCalledWith = null;
  const execute = {
    mcp: async (name, args) => {
      mcpCalledWith = { name, args };
      return { content: 'mcp-success-result' };
    }
  };

  const fakeRequest = async (messages) => {
    const last = messages[messages.length - 1];
    if (last.role === 'tool') {
      return { choices: [{ message: { role: 'assistant', content: 'Turn finished' } }] };
    }
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_mcp_1',
            type: 'function',
            function: { name: 'mcp__test__query', arguments: '{"q":"search"}' }
          }]
        }
      }]
    };
  };

  const outcome = await runTurn({
    messages: [{ role: 'user', content: 'run remote mcp tool' }],
    request: fakeRequest,
    execute,
  });

  assert.equal(outcome.text, 'Turn finished');
  assert.deepEqual(mcpCalledWith, { name: 'mcp__test__query', args: { q: 'search' } });
  const toolMsg = outcome.messages.find(m => m.role === 'tool');
  assert.ok(toolMsg, 'tool message must be present in conversation history');
  assert.deepEqual(JSON.parse(toolMsg.content), { content: 'mcp-success-result' });
});

test('runTurn works with createTools instance executing MCP tool calls', async () => {
  resetDeadServers();
  const { cwd, cleanup } = await fixture();
  try {
    const execute = createTools({
      cwd,
      approve: async () => true,
      mcpServers: [{ name: 'alpha', command: 'echo', args: [], env: {}, cwd: '', url: '' }]
    });

    const fakeRequest = async (messages) => {
      const last = messages[messages.length - 1];
      if (last.role === 'tool') {
        return { choices: [{ message: { role: 'assistant', content: 'Processed' } }] };
      }
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_alpha_1',
              type: 'function',
              function: { name: 'mcp__alpha__read', arguments: '{"file":"abc"}' }
            }]
          }
        }]
      };
    };

    const outcome = await runTurn({
      messages: [{ role: 'user', content: 'read via alpha' }],
      request: fakeRequest,
      execute,
    });

    assert.equal(outcome.text, 'Processed');
    const toolMsg = outcome.messages.find(m => m.role === 'tool');
    assert.ok(toolMsg, 'tool response must be in history');
    const content = JSON.parse(toolMsg.content);
    assert.ok('error' in content, 'dispatcher returned error payload without throwing');
    assert.ok(!content.error.includes('(no MCP servers configured)'));
  } finally {
    resetDeadServers();
    await cleanup();
  }
});
