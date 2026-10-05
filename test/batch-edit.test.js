// Batched edits must be all-or-nothing and must ask exactly once. The failure mode
// this guards against is a three-file rename where file 2 fails validation after file
// 1 was already written — the user approved "rename three files" and got one of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changeMany, combinedDiff, normalizeEol } from '../cli/batch.js';

const LIMIT = 64000;

async function workspace(t, files = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-batch-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(files)) await writeFile(join(cwd, name), body);
  const permits = [];
  const deps = {
    checked: async (input, allowMissing = false) => {
      if (typeof input !== 'string' || !input.length) throw new Error('Invalid path');
      if (input.includes('..')) throw new Error('Path outside project');
      void allowMissing;
      return join(cwd, input);
    },
    read: async full => {
      const info = await lstat(full);
      if (!info.isFile()) throw new Error('Not a regular file');
      if (info.size > LIMIT) throw new Error('File is not bounded text');
      return readFile(full, 'utf8');
    },
    permit: async proposal => { permits.push(proposal); },
    snapshots: new Map(Object.entries(files).map(([name, body]) => [join(cwd, name), body]))
  };
  return { cwd, deps, permits };
}

const residue = async cwd => (await readdir(cwd, { recursive: true }))
  .filter(name => name.includes('.sword-') || name.endsWith('.tmp'));

test('a valid batch writes every file under one approval and leaves no temp residue', async t => {
  const { cwd, deps, permits } = await workspace(t, { 'a.txt': 'alpha\n', 'b.txt': 'beta\n' });
  const result = await changeMany('write_file', [
    { path: 'a.txt', content: 'ALPHA\n' }, { path: 'b.txt', content: 'BETA\n' }
  ], deps);
  assert.equal(result.ok, true, result.error);
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'ALPHA\n');
  assert.equal(await readFile(join(cwd, 'b.txt'), 'utf8'), 'BETA\n');
  assert.equal(permits.length, 1, 'exactly one permit for the batch');
  assert.equal(permits[0].batch, true);
  assert.deepEqual(await residue(cwd), []);
  assert.equal(result.written.length, 2);
  assert.equal(result.written[0].bytes, Buffer.byteLength('ALPHA\n'));
});

test('a batch is all-or-nothing when one file fails validation', async t => {
  const { cwd, deps, permits } = await workspace(t, { 'a.txt': 'alpha\n', 'b.txt': 'beta\n' });
  // b.txt has never been read, so the edit baseline check refuses it.
  const result = await changeMany('write_file', [
    { path: 'a.txt', content: 'ALPHA\n' }, { path: 'b.txt', content: 'BETA\n' }
  ], { ...deps, snapshots: new Map([[join(cwd, 'a.txt'), 'alpha\n']]) });
  assert.equal(result.ok, false);
  assert.match(result.error, /Read file before editing/);
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'alpha\n', 'the valid file must be untouched');
  assert.equal(permits.length, 0, 'no approval is requested for a batch that never runs');
  assert.deepEqual(await residue(cwd), []);
});

test('an ambiguous or missing old_text rejects the whole batch', async t => {
  const { cwd, deps } = await workspace(t, { 'a.txt': 'x\ny\nx\n', 'b.txt': 'b\n' });
  const ambiguous = await changeMany('edit_file', [
    { path: 'a.txt', old_text: 'x', new_text: 'z' }, { path: 'b.txt', old_text: 'b', new_text: 'c' }
  ], deps);
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /matches 2 places/);
  assert.equal(await readFile(join(cwd, 'b.txt'), 'utf8'), 'b\n');
  const missing = await changeMany('edit_file', [{ path: 'b.txt', old_text: 'nope', new_text: 'c' }], deps);
  assert.match(missing.error, /Old text not found/);
});

test('a duplicate path in one batch is refused', async t => {
  const { deps } = await workspace(t, { 'a.txt': 'a\n' });
  const result = await changeMany('write_file', [{ path: 'a.txt', content: '1\n' }, { path: 'a.txt', content: '2\n' }], deps);
  assert.equal(result.ok, false);
  assert.match(result.error, /Duplicate path/);
});

test('a stale read baseline rejects the batch', async t => {
  const { cwd, deps } = await workspace(t, { 'a.txt': 'alpha\n' });
  const result = await changeMany('write_file', [{ path: 'a.txt', content: 'x\n' }],
    { ...deps, snapshots: new Map([[join(cwd, 'a.txt'), 'something else\n']]) });
  assert.equal(result.ok, false);
  assert.match(result.error, /changed since read/);
});

test('a denied batch writes nothing and says why', async t => {
  const { cwd, deps, permits } = await workspace(t, { 'a.txt': 'alpha\n' });
  const result = await changeMany('write_file', [{ path: 'a.txt', content: 'x\n' }],
    { ...deps, permit: async p => { permits.push(p); throw new Error('Action denied by user. NOT a tool or system failure'); } });
  assert.equal(result.ok, false);
  assert.match(result.error, /denied by user/);
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'alpha\n');
  assert.equal(permits.length, 1);
});
test('a mid-batch commit failure rolls the earlier files back', async t => {
  const { cwd, deps } = await workspace(t, { 'a.txt': 'alpha\n', 'b.txt': 'beta\n' });
  // Replace b.txt with a DIRECTORY of the same name: the staleness re-read can still
  // be satisfied by a stubbed read, but the temp+rename cannot land on a directory.
  const target = join(cwd, 'b.txt');
  await rm(target);
  await mkdir(target);
  const result = await changeMany('write_file', [{ path: 'a.txt', content: 'ALPHA\n' }, { path: 'b.txt', content: 'BETA\n' }],
    { ...deps, read: async full => (full === target ? 'beta\n' : readFile(full, 'utf8')) });
  assert.equal(result.ok, false);
  assert.match(result.error, /rolled back/);
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'alpha\n', 'file 1 is restored');
  assert.deepEqual(await residue(cwd), [], 'no temp file survives a rolled-back batch');
});

test('creates and overwrites share one approval', async t => {
  const { cwd, deps, permits } = await workspace(t, { 'old.txt': 'keep\n' });
  const result = await changeMany('write_file', [
    { path: 'new.txt', content: 'fresh\n' }, { path: 'old.txt', content: 'kept\n' }
  ], deps);
  assert.equal(result.ok, true, result.error);
  assert.equal(await readFile(join(cwd, 'new.txt'), 'utf8'), 'fresh\n');
  assert.equal(await readFile(join(cwd, 'old.txt'), 'utf8'), 'kept\n');
  assert.equal(permits.length, 1);
});

test('returned snapshots carry post-batch content so a later edit is allowed', async t => {
  const { cwd, deps } = await workspace(t, { 'a.txt': 'alpha\n' });
  const first = await changeMany('write_file', [{ path: 'a.txt', content: 'ALPHA\n' }], deps);
  assert.equal(first.ok, true, first.error);
  const second = await changeMany('write_file', [{ path: 'a.txt', content: 'ALPHA2\n' }], { ...deps, snapshots: first.snapshots });
  assert.equal(second.ok, true, second.error);
  assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'ALPHA2\n');
});

test('oversized and empty batches are refused without touching disk', async t => {
  const { deps } = await workspace(t, { 'a.txt': 'a\n' });
  assert.match((await changeMany('write_file', [], deps)).error, /Empty batch/);
  assert.match((await changeMany('write_file', [{ path: 'a.txt', content: 'x'.repeat(LIMIT + 1) }], deps)).error, /Invalid content/);
  assert.match((await changeMany('write_file', [{ path: 'a.txt', content: 'bad\0text' }], deps)).error, /Invalid content/);
  assert.match((await changeMany('delete_file', [{ path: 'a.txt' }], deps)).error, /Unsupported batch operation/);
});

test('combinedDiff shows every file in one approval block', () => {
  const lines = combinedDiff([
    { path: '/p/a.txt', before: 'one\ntwo\n', after: 'one\nTWO\n' },
    { path: '/p/b.txt', before: null, after: 'new\n' }
  ]);
  const text = lines.join('\n');
  assert.match(text, /\/p\/a\.txt/);
  assert.match(text, /\/p\/b\.txt/);
  assert.match(text, /TWO/);
  assert.equal(combinedDiff([]).length, 0);
});

test('normalizeEol matches on both sides of an edit', () => {
  assert.equal(normalizeEol('a\nb', '\r\n'), 'a\r\nb');
  assert.equal(normalizeEol('a\r\nb', '\n'), 'a\nb');
});
