// write_file must replace a file atomically: a crash mid-write leaves either the
// old file or the new one, never a half-written source file. It used to open the
// destination with flag 'w' and stream into it in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools } from '../cli/tools.js';

async function toolset(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-atomic-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, execute: createTools({ cwd, approve: async () => true, ragDb: join(cwd, 'm.db') }) };
}

test('an overwrite replaces content and leaves no temp file behind', async t => {
  const { cwd, execute } = await toolset(t);
  await writeFile(join(cwd, 'f.txt'), 'original\n');
  await execute('read_file', { path: 'f.txt' });
  const written = await execute('write_file', { path: 'f.txt', content: 'replaced\n' });
  assert.equal(written.bytes, Buffer.byteLength('replaced\n'));
  assert.equal(await readFile(join(cwd, 'f.txt'), 'utf8'), 'replaced\n');
  const residue = (await readdir(cwd)).filter(name => name.includes('.flow-') || name.endsWith('.tmp'));
  assert.deepEqual(residue, [], `no temp residue expected, found ${JSON.stringify(residue)}`);
});

test('a created file holds the exact bytes and leaves no temp residue', async t => {
  const { cwd, execute } = await toolset(t);
  const written = await execute('write_file', { path: 'new.txt', content: 'fresh\n' });
  assert.equal(written.bytes, Buffer.byteLength('fresh\n'));
  assert.equal(await readFile(join(cwd, 'new.txt'), 'utf8'), 'fresh\n');
  const residue = (await readdir(cwd)).filter(name => name.includes('.flow-') || name.endsWith('.tmp'));
  assert.deepEqual(residue, []);
});

test('an overwrite of an unread existing file is still refused', async t => {
  const { cwd, execute } = await toolset(t);
  await writeFile(join(cwd, 'existing.txt'), 'here\n');
  await assert.rejects(execute('write_file', { path: 'existing.txt', content: 'x' }), /Read file before editing/);
});