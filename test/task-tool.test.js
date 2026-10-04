// G4 — the task sub-agent tool: routing to an injected runner, graceful absence,
// and the enlarged tool surface (task + web_search + apply_patch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools, toolDefinitions } from '../cli/tools.js';
import { BUILTIN_TOOL_NAMES } from '../cli/mcpConfig.js';

async function cwd(t) {
  const d = await mkdtemp(join(tmpdir(), 'task-tool-'));
  t.after(() => rm(d, { recursive: true, force: true }));
  return d;
}

test('task routes to the injected sub-agent runner and surfaces its summary', async t => {
  const dir = await cwd(t);
  const calls = [];
  const task = async sub => { calls.push(sub); return { summary: 'entry point is index.js', steps: 3 }; };
  const ex = createTools({ cwd: dir, approve: async () => true, task });
  const res = await ex('task', { prompt: 'find the entry point', tools: ['read_file', 'search_files'], max_steps: 4 });
  assert.equal(res.summary, 'entry point is index.js');
  assert.equal(res.steps, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].prompt, 'find the entry point');
  assert.deepEqual(calls[0].tools, ['read_file', 'search_files']);
  assert.equal(calls[0].maxSteps, 4);
});

test('task without a runner returns a clear, non-throwing error', async t => {
  const dir = await cwd(t);
  const ex = createTools({ cwd: dir, approve: async () => true });
  const res = await ex('task', { prompt: 'anything' });
  assert.match(res.error, /not available/i);
});

test('a task failure is reported on the result, not thrown', async t => {
  const dir = await cwd(t);
  const ex = createTools({ cwd: dir, approve: async () => true, task: async () => ({ summary: '', steps: 0, error: 'boom' }) });
  const res = await ex('task', { prompt: 'x' });
  assert.match(res.error, /boom/);
});

test('the tool surface now includes task, web_search and apply_patch, in sync with BUILTIN_TOOL_NAMES', () => {
  const names = new Set(toolDefinitions.map(d => d.function.name));
  for (const n of ['task', 'web_search', 'apply_patch']) assert.ok(names.has(n), `missing ${n}`);
  // Every advertised tool must be a recognized builtin so MCP names never shadow one.
  for (const n of names) assert.ok(BUILTIN_TOOL_NAMES.includes(n), `tool ${n} not in BUILTIN_TOOL_NAMES`);
});
