import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareCalls, partitionCalls, runReadonly, runMutation, foldResults,
  toolContent, callKey, loopStopText, MAX_BATCH
} from '../cli/executor.js';

const call = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const MUTATING = new Set(['write_file', 'edit_file', 'run_command', 'save_to_rag']);
const isMutating = c => MUTATING.has(c?.function?.name);
const batchable = c => ['write_file', 'edit_file'].includes(c?.function?.name);
const defer = ms => new Promise(resolve => setTimeout(resolve, ms));

test('parallel reads overlap but fold back in original call order', async () => {
  const calls = [call('a', 'read_file', { path: 'a' }), call('b', 'read_file', { path: 'b' }), call('c', 'read_file', { path: 'c' })];
  let live = 0, peak = 0;
  const outcomes = await runReadonly(calls, { run: async entry => { live++; peak = Math.max(peak, live); await defer(20); live--; return { path: entry.args.path }; } });
  assert.equal(peak, 3, 'all three reads must be in flight at once');
  assert.equal(outcomes.length, 3);
  const history = foldResults([], outcomes);
  assert.deepEqual(history.map(m => m.tool_call_id), ['a', 'b', 'c'], 'fold order follows the CALL order, not completion order');
});

test('maxParallel bounds concurrency and defaults to four', async () => {
  const calls = Array.from({ length: 10 }, (_, i) => call(`r${i}`, 'search_files', { query: String(i) }));
  let live = 0, peak = 0;
  const run = async () => { live++; peak = Math.max(peak, live); await defer(10); live--; return { ok: true }; };
  await runReadonly(calls, { run, maxParallel: 2 });
  assert.equal(peak, 2);
  peak = 0;
  await runReadonly(calls, { run });
  assert.equal(peak, 4, 'default parallel width is 4');
  peak = 0;
  await runReadonly(calls, { run, maxParallel: 999 });
  assert.ok(peak <= 16, 'parallel width is hard-capped');
});

test('a mutation splits the read batch and runs after the preceding reads', async () => {
  const calls = [
    call('a', 'read_file', { path: 'a' }), call('b', 'read_file', { path: 'b' }),
    call('m', 'write_file', { path: 'x', content: 'x' }),
    call('c', 'read_file', { path: 'c' })
  ];
  const segments = partitionCalls(calls, { isMutating, batchable });
  assert.deepEqual(segments.map(s => s.kind), ['readonly', 'batch', 'readonly']);
  assert.deepEqual(segments[0].calls.map(c => c.id), ['a', 'b']);
  assert.deepEqual(segments[2].calls.map(c => c.id), ['c'], 'the read after a write is its own segment');

  const order = [];
  await runReadonly(segments[0].calls, { run: async e => { await defer(15); order.push(e.id); return {}; } });
  await runMutation(segments[1].calls, { run: async e => { order.push(e.id); return {}; }, batch: async entries => entries.map(e => ({ id: e.id, ok: true, result: {}, ms: 0 })) });
  await runReadonly(segments[2].calls, { run: async e => { order.push(e.id); return {}; } });
  assert.deepEqual(order, ['a', 'b', 'm', 'c']);
});

test('mutating calls never overlap', async () => {
  const calls = Array.from({ length: 4 }, (_, i) => call(`w${i}`, 'run_command', { command: 'echo', args: [String(i)] }));
  let live = 0, peak = 0;
  const outcomes = await runMutation(calls, { run: async e => { live++; peak = Math.max(peak, live); await defer(10); live--; return { exitCode: 0, id: e.id }; } });
  assert.equal(peak, 1, 'writes must be strictly sequential');
  assert.deepEqual(outcomes.map(o => o.id), ['w0', 'w1', 'w2', 'w3']);
});

test('batchable mutations collapse into one capped batch segment', () => {
  const many = Array.from({ length: MAX_BATCH + 3 }, (_, i) => call(`e${i}`, 'edit_file', { path: `f${i}` }));
  const segments = partitionCalls(many, { isMutating, batchable });
  assert.deepEqual(segments.map(s => s.kind), ['batch', 'batch']);
  assert.equal(segments[0].calls.length, MAX_BATCH);
  assert.equal(segments[1].calls.length, 3);
  const mixed = partitionCalls([call('x', 'read_file'), call('y', 'run_command'), call('z', 'read_file')], { isMutating, batchable });
  assert.deepEqual(mixed.map(s => s.kind), ['readonly', 'mutate', 'readonly']);
});

test('a batch of one mutation never goes through the batch path', async () => {
  let batchCalls = 0;
  await runMutation([call('only', 'write_file', { path: 'a' })], { run: async () => ({ bytes: 1 }), batch: async () => { batchCalls++; return []; } });
  assert.equal(batchCalls, 0);
});
test('exactly one result per id after a multi-call hard stop', async () => {
  const calls = Array.from({ length: 4 }, (_, i) => call(`id${i}`, 'read_file', { path: 'missing' }));
  // Two identical failures already on the ledger: this step's failures trip LOOP_HARD.
  const repeats = new Map([[callKey('read_file', { path: 'missing' }), { count: 2, failing: true }]]);
  const outcomes = calls.map((c, i) => ({ id: c.id, index: i, ok: false, result: { error: 'boom' } }));
  const { hardStop, text, answers, entries } = prepareCalls(calls, repeats, {}, outcomes);
  assert.equal(hardStop, true);
  assert.match(text, /Stop retrying/);
  assert.match(answers.get('id3'), /Stop retrying/);
  assert.equal(answers.size, 4, 'every id gets an answer exactly once');
  const ids = foldResults([], entries.map(e => e.outcome)).map(m => m.tool_call_id);
  assert.deepEqual(ids, ['id0', 'id1', 'id2', 'id3']);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate tool_call_id may reach the provider');
});

test('loop accounting is identical for out-of-order completion', () => {
  const calls = [call('a', 'read_file', { path: 'x' }), call('b', 'read_file', { path: 'x' })];
  const outcomes = [{ id: 'b', index: 1, ok: false, result: { error: 'no' } }, { id: 'a', index: 0, ok: false, result: { error: 'no' } }];
  const forward = new Map();
  prepareCalls(calls, forward, {}, outcomes);
  const reverse = new Map();
  prepareCalls(calls, reverse, {}, [...outcomes].reverse());
  assert.deepEqual([...forward.entries()], [...reverse.entries()]);
  assert.equal(forward.get(callKey('read_file', { path: 'x' })).count, 2);
});

test('a success mid-run resets the failure streak', () => {
  const calls = [call('a', 'read_file', { path: 'x' }), call('b', 'read_file', { path: 'x' }), call('c', 'read_file', { path: 'x' })];
  // Two identical failures on the ledger, then a success, then one more failure: the
  // streak must restart, so nothing here reaches LOOP_HARD.
  const repeats = new Map([[callKey('read_file', { path: 'x' }), { count: 2, failing: true }]]);
  const outcomes = [
    { id: 'a', index: 0, ok: true, result: { path: 'x' } },
    { id: 'b', index: 1, ok: false, result: { error: 'no' } },
    { id: 'c', index: 2, ok: false, result: { error: 'no' } }
  ];
  const { hardStop } = prepareCalls(calls, repeats, {}, outcomes);
  assert.equal(hardStop, false, 'an outcome change must clear the streak');
  assert.deepEqual(repeats.get(callKey('read_file', { path: 'x' })), { count: 2, failing: true });
});

test('repeated SUCCESSES annotate but never stop', () => {
  const calls = Array.from({ length: 5 }, (_, i) => call(`s${i}`, 'list_files'));
  const outcomes = calls.map((c, i) => ({ id: c.id, index: i, ok: true, result: { files: [] } }));
  const { hardStop, entries } = prepareCalls(calls, new Map(), {}, outcomes);
  assert.equal(hardStop, false);
  assert.match(entries.at(-1).outcome.content, /repetition is intentional/);
});

test('an aborted read batch keeps completed reads and leaves the rest unrepaired', async () => {
  const controller = new AbortController();
  const calls = Array.from({ length: 5 }, (_, i) => call(`r${i}`, 'read_file', { path: `f${i}` }));
  const outcomes = await runReadonly(calls, {
    maxParallel: 1,
    signal: controller.signal,
    run: async entry => { await defer(5); if (entry.id === 'r1') controller.abort(); return { path: entry.args.path }; }
  });
  assert.ok(outcomes.failure, 'abort is reported on the returned array');
  assert.deepEqual(outcomes.map(o => o.id), ['r0', 'r1'], 'completed reads survive the abort');
  const history = foldResults([{ role: 'assistant', content: null }], outcomes);
  assert.deepEqual(history.filter(m => m.role === 'tool').map(m => m.tool_call_id), ['r0', 'r1']);
});

test('abort before dispatch yields no outcomes at all', async () => {
  const controller = new AbortController();
  controller.abort();
  const outcomes = await runReadonly([call('a', 'read_file')], { signal: controller.signal, run: async () => ({}) });
  assert.equal(outcomes.length, 0);
  assert.ok(outcomes.failure);
});

test('a throwing tool becomes a result, an aborting signal does not', async () => {
  const boom = await runReadonly([call('a', 'read_file')], { run: async () => { throw new Error('kaboom'); } });
  assert.match(toolContent(boom[0].result), /kaboom/);
  const controller = new AbortController();
  const aborted = await runReadonly([call('a', 'read_file')], { signal: controller.signal, run: async () => { controller.abort(); throw new Error('AbortError'); } });
  assert.equal(aborted.length, 0);
  assert.ok(aborted.failure);
});

test('a throwing batch fails every id in the segment, exactly once each', async () => {
  const calls = [call('a', 'edit_file', {}), call('b', 'edit_file', {})];
  const outcomes = await runMutation(calls, { run: async () => ({ ok: true }), batch: async () => { throw new Error('denied by user'); } });
  const history = foldResults([], outcomes);
  assert.deepEqual(history.map(m => m.tool_call_id), ['a', 'b']);
  assert.match(history[0].content, /denied by user/);
});

test('a batch missing a result is reported rather than silently folded', async () => {
  const calls = [call('a', 'edit_file', {}), call('b', 'edit_file', {})];
  const outcomes = await runMutation(calls, { run: async () => ({}), batch: async () => [{ id: 'a', ok: true, result: { bytes: 1 }, ms: 0 }] });
  assert.match(outcomes.find(o => o.id === 'b').result.error, /batch produced no result/);
});

test('foldResults never mutates and is idempotent', () => {
  const history = [{ role: 'assistant', content: null }];
  const snapshot = JSON.stringify(history);
  const outcomes = [{ id: 'a', index: 0, content: '{"ok":true}' }, { id: 'a', index: 0, content: '{"ok":true}' }];
  const once = foldResults(history, outcomes);
  assert.equal(once.length, 2, 'the duplicate id is dropped');
  assert.notEqual(once, history, 'a new array is returned');
  assert.equal(JSON.stringify(history), snapshot, 'input untouched');
  assert.equal(foldResults(once, outcomes).length, 2, 're-folding does not append again');
});

test('malformed arguments are reported per call, not thrown', async () => {
  const calls = [{ id: 'a', type: 'function', function: { name: 'read_file', arguments: '{not json' } }];
  const outcomes = await runReadonly(calls, { run: async () => { throw new Error('should not run'); } });
  assert.match(outcomes[0].result.error, /Malformed JSON arguments/);
  assert.equal(calls[0].function.arguments, '{not json', 'the call object is not rewritten');
});

test('prepareCalls rejects structurally invalid calls', () => {
  assert.throws(() => prepareCalls([call('a', 'read_file'), { id: 'b' }], new Map()), /Invalid tool call/);
  assert.throws(() => prepareCalls(Array.from({ length: 17 }, (_, i) => call(`x${i}`, 'read_file')), new Map()), /Invalid tool calls/);
  const { entries, hardStop } = prepareCalls([call('a', 'read_file')], new Map());
  assert.equal(entries.length, 1);
  assert.equal(hardStop, false);
});

test('loopStopText and callKey are stable helpers', () => {
  assert.match(loopStopText('read_file', 3), /read_file.*3 times/);
  assert.equal(callKey('t', { b: 1, a: 2 }), callKey('t', { a: 2, b: 1 }));
});
test('runTurn runs parallel reads and folds in call order with one checkpoint per id', async () => {
  const { runTurn } = await import('../cli/agent.js');
  const calls = [
    { id: 'a', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'a' }) } },
    { id: 'b', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'b' }) } },
    { id: 'c', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'c' }) } },
  ];
  let live = 0, peak = 0;
  let n = 0;
  const checkpoints = [];
  const result = await runTurn({
    messages: [],
    request: async () => (++n === 1
      ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: calls } }] }
      : { choices: [{ message: { role: 'assistant', content: 'done' } }] }),
    execute: async (name, args) => {
      live++; peak = Math.max(peak, live);
      await new Promise(resolve => setTimeout(resolve, 20));
      live--;
      return { path: args.path };
    },
    onCheckpoint: snapshot => { checkpoints.push(snapshot); },
  });
  assert.equal(result.text, 'done');
  assert.ok(peak > 1, `reads must overlap, peak was ${peak}`);
  const folded = result.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id);
  assert.deepEqual(folded, ['a', 'b', 'c']);
  const toolCheckpoints = checkpoints.filter(s => s.some(m => m.role === 'tool'));
  assert.equal(toolCheckpoints.length, 2, 'assistant snapshot then one fold checkpoint');
  assert.deepEqual(toolCheckpoints[1].filter(m => m.role === 'tool').map(m => m.tool_call_id), folded);
});
test('runTurn batches consecutive edits behind one approval', async () => {
  const { runTurn } = await import('../cli/agent.js');
  const calls = [
    { id: 'a', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ path: 'a', old_text: 'x', new_text: 'y' }) } },
    { id: 'b', type: 'function', function: { name: 'edit_file', arguments: JSON.stringify({ path: 'b', old_text: 'x', new_text: 'y' }) } },
  ];
  let n = 0;
  let batchCalls = 0;
  const events = [];
  const result = await runTurn({
    messages: [],
    request: async () => (++n === 1
      ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: calls } }] }
      : { choices: [{ message: { role: 'assistant', content: 'done' } }] }),
    execute: Object.assign(async () => { throw new Error('must go through batch'); }, {
      batch: async (name, entries) => {
        batchCalls++;
        assert.equal(name, 'edit_file');
        assert.deepEqual(entries.map(e => e.id), ['a', 'b']);
        return entries.map(e => ({ path: e.args.path, bytes: 1 }));
      },
    }),
    onEvent: (name, info) => events.push([name, info]),
  });
  assert.equal(result.text, 'done');
  assert.equal(batchCalls, 1, 'one batch call for the segment');
  const ids = result.messages.filter(m => m.role === 'tool').map(m => m.tool_call_id);
  assert.deepEqual(ids, ['a', 'b']);
  assert.ok(events.some(([name, info]) => name === 'edit_file' && info && typeof info.summary === 'string'));
});
test('runTurn declares the sandbox mode on every run_command result', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runTurn } = await import('../cli/agent.js');
  const { createTools } = await import('../cli/tools.js');
  const { resetDetection } = await import('../cli/sandbox.js');
  const cwd = await mkdtemp(join(tmpdir(), 'flow-sandbox-'));
  try {
    resetDetection();
    const execute = createTools({ cwd, approve: async () => true });
    let n = 0;
    const result = await runTurn({
      messages: [],
      request: async () => (++n === 1
        ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
          { id: 's1', type: 'function', function: { name: 'run_command', arguments: JSON.stringify({ command: 'node', args: ['-e', '1'] }) } },
        ] } }] }
        : { choices: [{ message: { role: 'assistant', content: 'done' } }] }),
      execute,
    });
    assert.equal(result.text, 'done');
    const content = JSON.parse(result.messages.find(m => m.tool_call_id === 's1').content);
    assert.ok(['bwrap', 'firejail', 'sandbox-exec', 'none'].includes(content.sandbox), `sandbox declared, got ${content.sandbox}`);
  } finally {
    resetDetection();
    await rm(cwd, { recursive: true, force: true });
  }
});
test('runTurn keeps deny-overrides-allow and no checkpoint on a denied mixed turn', async () => {
  const { mkdtemp, rm, writeFile, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runTurn } = await import('../cli/agent.js');
  const { createTools } = await import('../cli/tools.js');
  const cwd = await mkdtemp(join(tmpdir(), 'flow-mixed-'));
  try {
    await writeFile(join(cwd, 'a.txt'), 'alpha\n');
    let n = 0;
    const execute = createTools({
      cwd,
      approve: async () => true,
      grants: { tools: new Set(['read_file', 'write_file']), deniedTools: new Set(['write_file']) },
    });
    const result = await runTurn({
      messages: [],
      request: async () => (++n === 1
        ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
          { id: 'r1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'a.txt' }) } },
          { id: 'w1', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'a.txt', content: 'X' }) } },
        ] } }] }
        : { choices: [{ message: { role: 'assistant', content: 'done' } }] }),
      execute,
    });
    assert.equal(result.text, 'done');
    const byId = new Map(result.messages.filter(m => m.role === 'tool').map(m => [m.tool_call_id, JSON.parse(m.content)]));
    assert.equal(byId.get('r1').content, 'alpha\n');
    assert.match(byId.get('w1').error, /denied by the current approval policy/);
    assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'alpha\n');
    assert.equal(execute.checkpoint.pending, false, 'denied turn leaves no checkpoint');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
