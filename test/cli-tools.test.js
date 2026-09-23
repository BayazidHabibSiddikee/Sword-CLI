import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools } from '../cli/tools.js';

async function fixture(t, approve) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-tools-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, execute: createTools({ cwd, approve, timeout: 1000 }) };
}
test('read, list and literal search work with project files', async t => {
  const { cwd, execute } = await fixture(t);
  await writeFile(join(cwd, 'hello.txt'), 'hello\nworld');
  assert.match((await execute('read_file', { path: 'hello.txt' })).content, /hello/);
  assert.deepEqual((await execute('list_files', {})).files, ['hello.txt']);
  assert.equal((await execute('search_files', { query: 'world' })).matches[0].line, 2);
});
test('file tools refuse traversal, symlinks, secrets, binary and invalid args', async t => {
  const { cwd, execute } = await fixture(t);
  await symlink('/tmp', join(cwd, 'link'));
  await writeFile(join(cwd, 'binary'), Buffer.from([0, 1, 2]));
  for (const path of ['../escape', '/etc/passwd', 'link/file', '.env', '.git/config', 'binary']) {
    await assert.rejects(execute('read_file', { path }));
  }
  await assert.rejects(execute('read_file', null));
  await assert.rejects(execute('unknown', {}));
  await assert.rejects(execute('search_files', { query: '' }));
});
test('all side effects default deny', async t => {
  const { execute } = await fixture(t);
  await assert.rejects(execute('write_file', { path: 'new', content: 'x' }), /denied/);
  await assert.rejects(execute('run_command', { command: process.execPath, args: ['--version'] }), /denied/);
});
test('approved edits require read, exact unique text, and reject stale content', async t => {
  const { cwd, execute } = await fixture(t, async () => true);
  await writeFile(join(cwd, 'a'), 'hello');
  await assert.rejects(execute('edit_file', { path: 'a', old_text: 'hello', new_text: 'bye' }), /Read/);
  await execute('read_file', { path: 'a' });
  await execute('edit_file', { path: 'a', old_text: 'hello', new_text: 'bye' });
  assert.equal(await readFile(join(cwd, 'a'), 'utf8'), 'bye');
  await execute('read_file', { path: 'a' });
  await writeFile(join(cwd, 'a'), 'external');
  await assert.rejects(execute('write_file', { path: 'a', content: 'overwrite' }), /changed/);
  await execute('write_file', { path: 'nested/new', content: 'created' });
  assert.equal(await readFile(join(cwd, 'nested/new'), 'utf8'), 'created');
});
test('commands return exit code and reject invalid input', async t => {
  const { execute } = await fixture(t, async () => true);
  const result = await execute('run_command', { command: process.execPath, args: ['-e', 'console.log("ok");process.exitCode=3'] });
  assert.equal(result.exitCode, 3);
  assert.match(result.stdout, /ok/);
  await assert.rejects(execute('run_command', { command: 'echo', args: 'bad' }));
});
