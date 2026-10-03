import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionDiff, formatSessionDiff } from '../cli/sessionDiff.js';
import * as checkpoints from '../cli/checkpoint.js';

const run = promisify(execFile);
async function git(cwd, args) { return (await run('git', args, { cwd })).stdout; }

async function repo(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'sess-diff-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await git(cwd, ['init', '-q', '.']);
  await git(cwd, ['config', 'user.email', 'e@e.t']);
  await git(cwd, ['config', 'user.name', 'e']);
  await writeFile(join(cwd, 'a.txt'), 'alpha\n');
  await writeFile(join(cwd, 'keep.txt'), 'kept\n');
  await git(cwd, ['add', '-A']);
  await git(cwd, ['commit', '-qm', 'init']);
  return cwd;
}

async function notARepo(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'sess-nogit-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

test('sessionDiff reports available:false outside a git repository', async t => {
  const cwd = await notARepo(t);
  const diff = await sessionDiff({ cwd, history: [{ role: 'user', content: 'hi' }], archivedCount: 3 });
  assert.equal(diff.available, false);
  assert.match(diff.reason, /not a git repository/);
  assert.equal(formatSessionDiff(diff), '', 'no block is injected when unavailable');
  assert.equal(formatSessionDiff(null), '');
});

test('sessionDiff is available:false with no cwd and with a repo but no baseline', async t => {
  assert.equal((await sessionDiff({})).available, false);
  const cwd = await repo(t);
  const bare = await sessionDiff({ cwd });
  assert.equal(bare.available, false, 'a fresh repo has no checkpoint to compare against');
  assert.match(bare.reason, /no checkpoint/);
});

test('sessionDiff lists tracked modifications and new untracked files', async t => {
  const cwd = await repo(t);
  const snapshot = await checkpoints.create(cwd, 'session start');
  assert.equal(snapshot.ok, true);
  await writeFile(join(cwd, 'a.txt'), 'ALPHA\n');
  await writeFile(join(cwd, 'new.txt'), 'brand new\n');
  const diff = await sessionDiff({ cwd, snapshot, history: [{ role: 'user', content: 'q' }] });
  assert.equal(diff.available, true);
  assert.equal(diff.total, 2);
  assert.equal(diff.tracked, 1);
  assert.equal(diff.untracked, 1);
  assert.equal(diff.baseline.id, snapshot.id);
  assert.match(diff.since, /checkpoint/);
  assert.deepEqual(diff.files.map(f => f.path).sort(), ['a.txt', 'new.txt']);
  assert.equal(diff.files.find(f => f.path === 'a.txt').status, 'M');
  assert.equal(diff.files.find(f => f.path === 'new.txt').status, 'A');
  assert.equal(diff.turns, 1);
});

test('sessionDiff reports no changes for an untouched tree', async t => {
  const cwd = await repo(t);
  const snapshot = await checkpoints.create(cwd, 'start');
  const diff = await sessionDiff({ cwd, snapshot });
  assert.equal(diff.available, true);
  assert.equal(diff.total, 0);
  assert.deepEqual(diff.files, []);
  const block = formatSessionDiff(diff);
  assert.match(block, /<workspace-diff>/);
  assert.match(block, /no files changed/);
  assert.match(block, /<\/workspace-diff>/);
});

test('formatSessionDiff caps the file list and reports the remainder', async t => {
  const cwd = await repo(t);
  const snapshot = await checkpoints.create(cwd, 'start');
  for (let i = 0; i < 8; i++) await writeFile(join(cwd, `f${i}.txt`), `x${i}\n`);
  const diff = await sessionDiff({ cwd, snapshot, maxItems: 3 });
  assert.equal(diff.total, 8);
  assert.equal(diff.files.length, 3);

test('sessionDiff still works after history was archived, with an EMPTY message log', async t => {
  // The regression this guards: once archiving trims the log, the model has no
  // in-memory record of what changed. The diff must come from git alone.
  const cwd = await repo(t);
  const snapshot = await checkpoints.create(cwd, 'session start');
  await writeFile(join(cwd, 'a.txt'), 'CHANGED BY THE AGENT\n');
  await writeFile(join(cwd, 'added.txt'), 'new file from a tool\n');
  // Nothing left in memory: 41 turns were archived out of context.
  const diff = await sessionDiff({ cwd, snapshot, history: [], archivedCount: 41 });
  assert.equal(diff.available, true);
  assert.equal(diff.turns, 0);
  assert.equal(diff.archivedCount, 41);
  assert.deepEqual(diff.files.map(f => f.path).sort(), ['a.txt', 'added.txt']);
  const block = formatSessionDiff(diff);
  assert.match(block, /41 earlier turn\(s\) were archived out of context/);
  assert.match(block, /knowledge library/);
});

test('sessionDiff falls back to the checkpoint ref list when the snapshot is gone', async t => {
  const cwd = await repo(t);
  const first = await checkpoints.create(cwd, 'first turn');
  await writeFile(join(cwd, 'a.txt'), 'MID SESSION\n');
  const second = await checkpoints.create(cwd, 'second turn');
  await writeFile(join(cwd, 'a.txt'), 'LATEST\n');
  await writeFile(join(cwd, 'later.txt'), 'later\n');
  // No snapshot argument at all — a resumed session whose baseline was pruned.
  const diff = await sessionDiff({ cwd, history: [] });
  assert.equal(diff.available, true);
  assert.equal(diff.baseline.id, first.id, 'the OLDEST surviving checkpoint is the baseline');
  assert.notEqual(diff.baseline.id, second.id);
  assert.deepEqual(diff.files.map(f => f.path), ['a.txt', 'later.txt']);
});

test('sessionDiff does not list files that were already in the baseline snapshot', async t => {
  const cwd = await repo(t);
  const snapshot = await checkpoints.create(cwd, 'start');
  assert.ok(snapshot.files.includes('keep.txt'));
  await mkdir(join(cwd, 'sub'), { recursive: true });
  await writeFile(join(cwd, 'sub', 'deep.txt'), 'deep\n');
  const diff = await sessionDiff({ cwd, snapshot });
  assert.equal(diff.files.filter(f => f.path === 'keep.txt').length, 0);
  assert.deepEqual(diff.files.map(f => f.path), ['sub/deep.txt']);
});

test('sessionDiff does not mutate its inputs', async t => {
  const cwd = await repo(t);
  const snapshot = await checkpoints.create(cwd, 'start');
  await writeFile(join(cwd, 'a.txt'), 'x\n');
  const snapshotBefore = JSON.stringify(snapshot);
  const history = [{ role: 'user', content: 'q' }];
  const diff = await sessionDiff({ cwd, snapshot, history, archivedCount: 2 });
  assert.equal(JSON.stringify(snapshot), snapshotBefore);
  assert.equal(history.length, 1);
  assert.notEqual(diff.files, snapshot.files);
});

  assert.equal(diff.hidden, 5);
  const block = formatSessionDiff(diff);
  assert.equal(block.split('\n').filter(l => /^  (new|modified|deleted) /.test(l)).length, 3);
  assert.match(block, /\.\.\. and 5 more/);
  assert.match(block, /changed since session start \(8 files\)/);
});
