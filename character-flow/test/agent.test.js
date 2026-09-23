import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTurn, loadSession, saveSession, providerConfig, createRequest } from '../cli/agent.js';
import { cancelMessage, timeoutMessage, toolLine, friendlyError } from '../cli/ui.js';

test('cancel and timeout messages are friendly and stable', () => {
  assert.match(cancelMessage(), /Cancelled/);
  assert.match(timeoutMessage(), /timed out/);
  assert.match(timeoutMessage(30), /\b30 s\b/);
});

test('toolLine renders ok, failure, timeout and truncated summaries', () => {
  assert.match(toolLine('read_file', { ok: true, ms: 12, summary: 'src/a.js' }), /✓ read_file 12ms src\/a\.js$/);
  assert.match(toolLine('run_command', { ok: false, ms: 100, summary: 'exit=1' }), /✗ run_command failed 100ms exit=1$/);
  assert.match(toolLine('fixture', { ok: true, ms: 5.6 }), /✓ fixture 6ms$/);
  assert.match(toolLine('fixture', { ok: true }), /^✓ fixture$/);
  const long = toolLine('x', { ok: true, ms: 1, summary: 'y'.repeat(80) });
  assert.ok(long.length < 80, 'summary must be truncated');
  assert.ok(!toolLine('x', { ok: true, ms: 1, summary: 'a\nb' }).includes('\n'), 'single line only');
});

test('friendlyError distinguishes cancel, timeout and generic errors', () => {
  assert.match(friendlyError(new DOMException('aborted', 'AbortError'), { aborted: true }), /Cancelled/);
  assert.match(friendlyError(new DOMException('timed out', 'TimeoutError'), { aborted: false }), /timed out/);
  assert.match(friendlyError(new Error('Provider HTTP 500'), { aborted: false }), /HTTP 500/);
  assert.equal(friendlyError(new DOMException('aborted', 'AbortError'), { aborted: false }), 'Error: aborted');
});

test('runTurn reports tool outcomes via onEvent with ok, duration and summary', async () => {
  const events = [];
  let count = 0;
  const request = async () => {
    if (count++ === 0) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'a', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } }
    ] } }] };
    return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
  };
  const result = await runTurn({ messages: [], request, execute: async () => ({ ok: 1 }), onEvent: (name, info) => events.push([name, info]) });
  assert.equal(result.text, 'done');
  assert.equal(events[0][0], 'read_file');
  assert.equal(events[0][1], undefined, 'pre-execution event keeps single-arg shape');
  assert.equal(events[1][0], 'read_file');
  assert.equal(events[1][1].ok, true);
  assert.equal(typeof events[1][1].ms, 'number');
  assert.equal(events[1][1].summary, 'x');
});

test('runTurn reports failed tools and run_command summaries', async () => {
  const events = [];
  let count = 0;
  const request = async () => {
    if (count++ === 0) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'a', type: 'function', function: { name: 'run_command', arguments: '{}' } }
    ] } }] };
    return { choices: [{ message: { role: 'assistant', content: 'done' } }] };
  };
  await runTurn({ messages: [], request,
    execute: async () => ({ exitCode: 3, stdout: '', stderr: '' }),
    onEvent: (name, info) => events.push([name, info]) });
  assert.equal(events[1][1].ok, true);
  assert.equal(events[1][1].summary, 'exit=3');
  let failing = 0;
  const failRequest = async () => {
    if (failing++ === 0) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [
      { id: 'b', type: 'function', function: { name: 'boom', arguments: '{}' } }
    ] } }] };
    return { choices: [{ message: { role: 'assistant', content: 'recovered' } }] };
  };
  await runTurn({ messages: [], request: failRequest,
    execute: async () => { throw new Error('missing binary'); },
    onEvent: (name, info) => events.push([name, info]) });
  const last = events.at(-1)[1];
  assert.equal(last.ok, false);
  assert.match(last.summary, /missing binary/);
});

test('aborted turn checkpoints synthetic tool results for every unanswered call', async () => {
  let checkpoint;
  const controller = new AbortController();
  const request = async () => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [
    { id: 'a', type: 'function', function: { name: 'one', arguments: '{}' } },
    { id: 'b', type: 'function', function: { name: 'two', arguments: '{}' } }
  ] } }] });
  await assert.rejects(runTurn({ messages: [], request,
    execute: async () => { controller.abort(); controller.signal.throwIfAborted(); },
    signal: controller.signal,
    onCheckpoint: snapshot => { checkpoint = snapshot; } }));
  const toolMessages = checkpoint.filter(message => message.role === 'tool');
  assert.deepEqual(toolMessages.map(message => message.tool_call_id).sort(), ['a', 'b']);
  for (const message of toolMessages) assert.deepEqual(JSON.parse(message.content), { error: 'aborted' });
});

async function workspace(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-session-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}
test('sessions round-trip history, default missing and validate names', async t => {
  const cwd = await workspace(t);
  assert.deepEqual(await loadSession(cwd, 'test'), []);
  const messages = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'world' }];
  await saveSession(cwd, 'test', messages);
  assert.deepEqual(await loadSession(cwd, 'test'), messages);
  await saveSession(cwd, 'test', []);
  assert.deepEqual(await loadSession(cwd, 'test'), []);
  await assert.rejects(loadSession(cwd, '../bad'), /Invalid session/);
});
test('sessions reject corrupt, wrong-project and symlink data', async t => {
  const cwd = await workspace(t);
  await mkdir(join(cwd, '.flow'));
  const file = join(cwd, '.flow', 'test.json');
  await writeFile(file, '{');
  await assert.rejects(loadSession(cwd, 'test'), SyntaxError);
  await writeFile(file, JSON.stringify({ cwd: 'elsewhere', messages: [] }));
  await assert.rejects(loadSession(cwd, 'test'), /Invalid session/);
  await symlink(file, join(cwd, '.flow', 'link.json'));
  await assert.rejects(loadSession(cwd, 'link'), /Unsafe session/);
  const other = await workspace(t);
  await symlink(join(cwd, '.flow'), join(other, '.flow'));
  await assert.rejects(loadSession(other, 'test'), /Unsafe session/);
});
test('provider rejects credentials and config defaults safely', () => {
  assert.equal(providerConfig({}).model, 'auto');
  assert.equal(providerConfig({ OPENAI_API_KEY: 'test' }).key, 'test');
  for (const url of ['https://user:pass@example.com', 'https://example.com/?key=x', 'ftp://localhost']) {
    assert.throws(() => providerConfig({ OPENAI_BASE_URL: url }));
  }
});
test('loop validates tool structure, response text and cancellation', async () => {
  const requestFor = message => async () => ({ choices: [{ message: { role: 'assistant', ...message } }] });
  for (const message of [{ content: '' }, { tool_calls: {} }, { tool_calls: [{ function: {} }] }]) {
    await assert.rejects(runTurn({ messages: [], request: requestFor(message), execute: async () => ({}) }));
  }
  await assert.rejects(runTurn({ messages: [], request: async () => {}, signal: AbortSignal.abort() }));
  let count = 0;
  const result = await runTurn({ messages: [], execute: async () => { throw new Error('should not execute malformed JSON'); }, request: async messages => {
    if (count++ === 0) return requestFor({ tool_calls: [{ id: 'x', function: { name: 'read_file', arguments: '{' } }] })();
    assert.match(messages.at(-1).content, /error/);
    return requestFor({ content: 'recovered' })();
  } });
  assert.equal(result.text, 'recovered');
});
test('request refuses over-budget context before network access', async () => {
  await assert.rejects(createRequest({ url: 'http://localhost', model: 'auto' }, [])([{ content: 'x'.repeat(500001) }]), /Context limit/);
});
