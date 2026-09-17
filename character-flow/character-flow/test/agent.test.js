import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession, saveSession, runTurn, providerConfig, createRequest } from '../cli/agent.js';

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
