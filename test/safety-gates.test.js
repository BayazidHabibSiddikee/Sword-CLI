import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools, normalizeEol, truncateMiddle } from '../cli/tools.js';
import { unifiedDiff } from '../cli/ui.js';
import { runTurn } from '../cli/agent.js';

async function fixture(t, approve, grants) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-gate-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, execute: createTools({ cwd, approve, timeout: 1000, grants, ragDb: join(cwd, 'mem.db') }) };
}

// --- approval grants ---------------------------------------------------------

test('a session grant lets a tool through without asking again', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-gate-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const grants = { tools: new Set(), deniedTools: new Set() };
  let asked = 0;
  const execute = createTools({ cwd, approve: async () => { asked++; return true; }, grants, ragDb: join(cwd, 'm.db') });
  await writeFile(join(cwd, 'x'), 'one');
  await execute('read_file', { path: 'x' });
  await execute('write_file', { path: 'x', content: 'a' });
  assert.equal(asked, 1, 'first write asks');
  grants.tools.add('write_file');
  await execute('write_file', { path: 'x', content: 'b' });
  assert.equal(asked, 1, 'granted tool must not ask again');
});

test('a deny overrides an existing grant', async t => {
  let asked = 0;
  const grants = { tools: new Set(['write_file']), deniedTools: new Set(['write_file']) };
  const cwd = await mkdtemp(join(tmpdir(), 'flow-deny-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => { asked++; return true; }, grants, ragDb: join(cwd, 'm.db') });
  await execute('read_file', { path: 'x' }).catch(() => {});
  await writeFile(join(cwd, 'x'), 'one');
  await execute('read_file', { path: 'x' });
  await assert.rejects(execute('write_file', { path: 'x', content: 'b' }), /denied by the current approval policy/);
  assert.equal(asked, 0, 'a denied tool must never reach the prompt');
});

test('a grant does not leak to a different tool', async t => {
  let asked = 0;
  const cwd = await mkdtemp(join(tmpdir(), 'flow-leak-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const grants = { tools: new Set(['write_file']), deniedTools: new Set() };
  const execute = createTools({ cwd, approve: async () => { asked++; return true; }, grants, ragDb: join(cwd, 'm.db') });
  await writeFile(join(cwd, 'x'), 'one');
  await execute('read_file', { path: 'x' });
  await execute('write_file', { path: 'x', content: 'a' });
  assert.equal(asked, 0, 'write_file used its grant without asking');
  // run_command is not granted, so it must still reach the prompt.
  await execute('run_command', { command: 'echo', args: ['hi'] });
  assert.equal(asked, 1, 'run_command must still ask');
});

test('an allow-all grant covers every mutating tool', async t => {
  let asked = 0;
  const cwd = await mkdtemp(join(tmpdir(), 'flow-all-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => { asked++; return true; }, grants: { tools: new Set(['*']), deniedTools: new Set() }, ragDb: join(cwd, 'm.db') });
  await execute('run_command', { command: 'echo', args: ['ok'] });
  assert.equal(asked, 0);
});

test('a refusal is distinguishable from a tool failure', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-refuse-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => false, ragDb: join(cwd, 'm.db') });
  await writeFile(join(cwd, 'x'), 'one');
  await execute('read_file', { path: 'x' });
  await assert.rejects(execute('write_file', { path: 'x', content: 'b' }), error => {
    assert.match(error.message, /denied by user/);
    assert.match(error.message, /NOT a tool or system failure/);
    return true;
  });
});

// --- read_file ranges --------------------------------------------------------

test('read_file returns line counts and can page through a large file', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-range-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => true, ragDb: join(cwd, 'm.db') });
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
  await writeFile(join(cwd, 'big'), lines.join('\n'));

  const whole = await execute('read_file', { path: 'big' });
  assert.equal(whole.lines, 1000);

  const page = await execute('read_file', { path: 'big', offset: 10, limit: 5 });
  assert.equal(page.offset, 10);
  assert.equal(page.lines, 5);
  assert.equal(page.total_lines, 1000);
  assert.equal(page.truncated, true);
  assert.equal(page.content, 'line 10\nline 11\nline 12\nline 13\nline 14');

  const tail = await execute('read_file', { path: 'big', offset: 995, limit: 50 });
  assert.equal(tail.truncated, false);
  assert.equal(tail.lines, 5);
});

test('a file above the whole-file cap is still readable in ranges', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-huge-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => true, ragDb: join(cwd, 'm.db') });
  const big = 'x'.repeat(300000);
  await writeFile(join(cwd, 'huge'), big);
  // Whole-file read is refused with an actionable message rather than a bare refusal.
  await assert.rejects(execute('read_file', { path: 'huge' }), /offset\/limit/);
  const ranged = await execute('read_file', { path: 'huge', offset: 0, limit: 10 });
  assert.equal(ranged.total_lines, 1);
});

test('a partial read never becomes the edit baseline', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-partial-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => true, ragDb: join(cwd, 'm.db') });
  const content = Array.from({ length: 50 }, (_, i) => `row ${i}`).join('\n');
  await writeFile(join(cwd, 'f'), content);
  await execute('read_file', { path: 'f', offset: 0, limit: 5 });
  // Must be refused as "read before editing", NOT silently compared as a fragment.
  await assert.rejects(execute('write_file', { path: 'f', content: 'new' }), /Read file before editing/);
  await execute('read_file', { path: 'f' });
  const written = await execute('write_file', { path: 'f', content: 'new' });
  assert.equal(written.bytes, 3);
});

// --- edit matching -----------------------------------------------------------

test('edits match CRLF files and report how many places collided', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-eol-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => true, ragDb: join(cwd, 'm.db') });
  await writeFile(join(cwd, 'crlf'), 'alpha\r\nbeta\r\ngamma\r\n');
  await execute('read_file', { path: 'crlf' });
  await execute('edit_file', { path: 'crlf', old_text: 'alpha\nbeta', new_text: 'BETA' });
  const { readFile } = await import('node:fs/promises');
  const after = await readFile(join(cwd, 'crlf'), 'utf8');
  assert.ok(after.includes('BETA'), 'LF-only old_text must still match a CRLF file');
  assert.ok(after.includes('\r\n'), 'file line endings must be preserved');

  await writeFile(join(cwd, 'dup'), 'x\nx\n');
  await execute('read_file', { path: 'dup' });
  await assert.rejects(execute('edit_file', { path: 'dup', old_text: 'x', new_text: 'y' }), /matches 2 places/);
});

test('a missing old_text is reported as not found', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-miss-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const execute = createTools({ cwd, approve: async () => true, ragDb: join(cwd, 'm.db') });
  await writeFile(join(cwd, 'f'), 'hello world');
  await execute('read_file', { path: 'f' });
  await assert.rejects(execute('edit_file', { path: 'f', old_text: 'nope', new_text: 'y' }), /not found/);
});

test('normalizeEol rewrites to the requested ending', () => {
  assert.equal(normalizeEol('a\nb', '\r\n'), 'a\r\nb');
  assert.equal(normalizeEol('a\r\nb', '\n'), 'a\nb');
});

// --- diff preview ------------------------------------------------------------

test('the approval diff shows the changed lines with surrounding context', () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const after = before.replace('line 20', 'LINE TWENTY');
  const text = unifiedDiff(before, after).join('\n');
  assert.match(text, /- line 20/);
  assert.match(text, /\+ LINE TWENTY/);
  assert.match(text, /line 19/, 'unchanged context is shown');
  assert.ok(!/line 0\b/.test(text), 'the far end of the file must not be dumped');
  assert.ok(unifiedDiff(before, after).length <= 12, 'diff must stay near the change');
});

test('the approval diff for a create reports no removals', () => {
  const lines = unifiedDiff(null, 'a\nb\nc');
  assert.equal(lines.length, 3);
  assert.ok(lines.every(l => l.startsWith('+')), `expected only additions, got ${JSON.stringify(lines)}`);
});

test('an identical before and after yields no diff', () => {
  assert.deepEqual(unifiedDiff('same', 'same'), []);
});

test('an oversized diff is capped and says how much was hidden', () => {
  const before = Array.from({ length: 400 }, (_, i) => `old ${i}`).join('\n');
  const after = Array.from({ length: 400 }, (_, i) => `new ${i}`).join('\n');
  const lines = unifiedDiff(before, after, 20);
  assert.ok(lines.length <= 22, 'diff must stay bounded');
  assert.ok(lines.some(l => l.includes('more diff lines')));
});

// --- middle truncation -------------------------------------------------------

test('truncation keeps the head and the tail, not the first N chars', () => {
  const body = `HEAD${'x'.repeat(5000)}TAIL`;
  const out = truncateMiddle(body, 200);
  assert.ok(out.startsWith('HEAD'));
  assert.ok(out.includes('TAIL'));
  assert.ok(out.includes('head and tail preserved'));
  assert.ok(out.length <= 200);
});

test('short values are untouched by truncation', () => {
  assert.equal(truncateMiddle('short', 200), 'short');
});

// --- loop detection ----------------------------------------------------------

function loopRequest(tool, args) {
  let id = 0;
  return async () => {
    id++;
    return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `c${id}`, function: { name: tool, arguments: JSON.stringify(args) } }] } }] };
  };
}

test('an identical failing call is stopped before the step limit', async t => {
  let attempts = 0;
  const result = await runTurn({
    messages: [{ role: 'user', content: 'go' }],
    request: loopRequest('write_file', { path: 'x', content: 'y' }),
    execute: async () => { attempts++; return { error: 'Read file before editing' }; },
    maxSteps: 20
  });
  assert.ok(attempts < 10, `must stop early, made ${attempts} attempts`);
  assert.match(result.text, /identical arguments 3 times/);
  assert.match(result.text, /Stop retrying/);
});

test('loop detection does not fire when the model changes strategy', async t => {
  let n = 0;
  const result = await runTurn({
    messages: [{ role: 'user', content: 'go' }],
    request: async () => {
      n++;
      if (n < 6) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, function: { name: 'read_file', arguments: JSON.stringify({ path: `f${n}` }) } }] } }] };
      return { choices: [{ message: { role: 'assistant', content: 'done', tool_calls: [] } }] };
    },
    execute: async () => ({ ok: true }),
    maxSteps: 20
  });
  assert.equal(result.text, 'done');
});

test('three consecutive failures inject a recovery instruction', async () => {
  const seen = [];
  let n = 0;
  await runTurn({
    messages: [{ role: 'user', content: 'go' }],
    request: async () => {
      n++;
      seen.push(n);
      if (n === 4) return { choices: [{ message: { role: 'assistant', content: 'recovered', tool_calls: [] } }] };
      return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, function: { name: 'search_files', arguments: JSON.stringify({ query: `q${n}` }) } }] } }] };
    },
    execute: async () => ({ error: 'nope' }),
    maxSteps: 20
  }).catch(() => {});
  assert.equal(seen.length, 4, 'the run should continue past repeated failures');
});

test('malformed JSON arguments do not execute the tool', async t => {
  let ran = false;
  const result = await runTurn({
    messages: [{ role: 'user', content: 'go' }],
    request: async () => ({ choices: [{ message: { role: 'assistant', content: 'bad json', tool_calls: [{ id: 'c1', function: { name: 'read_file', arguments: '{oops' } }] } }] }),
    execute: async () => { ran = true; return {}; },
    maxSteps: 3
  });
  assert.equal(ran, false, 'unparseable arguments must not reach execute');
  // Repeating the identical malformed call is itself a loop, so the guard fires and
  // reports it rather than letting the model hammer on forever.
  assert.match(result.text, /bad json/);
  assert.match(result.text, /Stop retrying/);
});