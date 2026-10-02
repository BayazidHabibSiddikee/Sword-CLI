import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createTools } from '../cli/tools.js';
import * as checkpoints from '../cli/checkpoint.js';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'cp-e2e-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const { execSync } = await import('node:child_process');
  execSync('git init -q .', { cwd });
  execSync('git config user.email e@e.t', { cwd });
  execSync('git config user.name e', { cwd });
  await writeFile(join(cwd, 'a.txt'), 'alpha\n');
  await writeFile(join(cwd, 'keep.txt'), 'kept\n');
  execSync('git add -A && git commit -qm init', { cwd });
  return cwd;
}

test('pending is false until a mutating tool is approved', async t => {
  const cwd = await fixture(t);
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  assert.equal(tools.checkpoint.pending, false);
  await tools('read_file', { path: 'a.txt' });
  assert.equal(tools.checkpoint.pending, false, 'read must not snapshot');
});

test('a single snapshot is taken for a turn even across multiple writes', async t => {
  const cwd = await fixture(t);
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  // write_file requires reading first (the tool enforces this policy).
  await tools('read_file', { path: 'a.txt' });
  await tools('write_file', { path: 'a.txt', content: 'ALPHA\n' });
  await tools('write_file', { path: 'b.txt', content: 'beta\n' });
  const list = await checkpoints.list(cwd);
  assert.equal(list.length, 1, 'exactly one checkpoint per turn');
  assert.equal(tools.checkpoint.pending, true);
});

test('/undo rolls back modified and newly-created files', async t => {
  const cwd = await fixture(t);
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  await tools('read_file', { path: 'a.txt' });
  await tools('write_file', { path: 'a.txt', content: 'MODIFIED\n' });
  await tools('write_file', { path: 'new.txt', content: 'newly born\n' });
  assert.ok(existsSync(join(cwd, 'new.txt')));
  const undo = await tools.checkpoint.undo();
  assert.ok(undo.ok);
  const fs = await import('node:fs');
  const content = await fs.promises.readFile(join(cwd, 'a.txt'), 'utf8');
  assert.equal(content, 'alpha\n');
  assert.ok(!existsSync(join(cwd, 'new.txt')), 'new file must be removed');
  assert.equal(tools.checkpoint.pending, false, 'snapshot consumed');
});

test('/undo refuses when there is no pending snapshot', async t => {
  const cwd = await fixture(t);
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  const r = await tools.checkpoint.undo();
  assert.equal(r.ok, false);
  assert.match(r.reason, /nothing to roll back/);
});

test('staging state is preserved across rollback', async t => {
  const cwd = await fixture(t);
  const { execSync } = await import('node:child_process');
  // Stage keep.txt with different content.
  await writeFile(join(cwd, 'keep.txt'), 'staged-partial\n');
  execSync('git add keep.txt', { cwd });
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  await tools('read_file', { path: 'a.txt' });
  await tools('write_file', { path: 'a.txt', content: 'changed\n' });
  await tools.checkpoint.undo();
  const staged = execSync('git diff --cached --name-only', { cwd }).toString().trim();
  assert.equal(staged, 'keep.txt', 'index must be preserved');
});

test('user stash list is untouched by checkpointing', async t => {
  const cwd = await fixture(t);
  const { execSync } = await import('node:child_process');
  await writeFile(join(cwd, 'stash-target.txt'), 'stash content\n');
  execSync('git add stash-target.txt && git stash push -m personal', { cwd });
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  await tools('read_file', { path: 'a.txt' });
  await tools('write_file', { path: 'a.txt', content: 'mutated\n' });
  await tools.checkpoint.undo();
  const stashList = execSync('git stash list', { cwd }).toString();
  assert.ok(stashList.includes('personal'), 'stash must survive');
});

test('denied approval leaves no checkpoint behind', async t => {
  const cwd = await fixture(t);
  let asked = 0;
  const tools = createTools({ cwd, approve: async () => { asked++; throw new Error('nope'); }, timeout: 5000, ragDb: join(cwd, 'm.db') });
  try {
    await tools('read_file', { path: 'a.txt' });
    await tools('write_file', { path: 'a.txt', content: 'x' });
  } catch { /* expected */ }
  assert.equal(tools.checkpoint.pending, false, 'denied turn must not snapshot');
  assert.equal(asked, 1);
});

test('load_skill tool returns loaded:true when a known skill is requested', async t => {
  const cwd = await fixture(t);
  const tools = createTools({ cwd, approve: async () => true, timeout: 5000, ragDb: join(cwd, 'm.db'), checkpoint: { create: (l) => checkpoints.create(cwd, l), restore: (s) => checkpoints.restore(cwd, s) } });
  const result = await tools('load_skill', { skill_name: 'adapt' });
  assert.equal(result.loaded, true);
  assert.ok(typeof result.content === 'string');
  assert.ok(result.content.length > 0);
});
