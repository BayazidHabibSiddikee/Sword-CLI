// apply_patch: unified-diff parsing + atomic application, both at the pure-helper
// level and through the full tool (approval gate + on-disk effect).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools, parseUnifiedPatch, applyUnifiedPatch } from '../cli/tools.js';

const DIFF = `diff --git a/a.js b/a.js
--- a/a.js
+++ b/a.js
@@ -1,3 +1,3 @@
 const keep = 1;
-const old = 2;
+const new = 2;
 const tail = 3;
diff --git a/b.txt b/b.txt
new file mode 100644
--- /dev/null
+++ b/b.txt
@@ -0,0 +1,2 @@
+brand
+new file
diff --git a/c.txt b/c.txt
deleted file mode 100644
--- a/c.txt
+++ /dev/null
@@ -1 +0,0 @@
-removing this line
`;

test('parseUnifiedPatch splits create/modify/delete sections into pre/post hunks', () => {
  const files = parseUnifiedPatch(DIFF);
  assert.deepEqual(files.map(f => f.path), ['a.js', 'b.txt', 'c.txt']);
  assert.equal(files[0].isCreate, false);
  assert.equal(files[1].isCreate, true);
  assert.equal(files[2].isDelete, true);
  // The modify hunk: pre-image (context+removed) vs post-image (context+added).
  assert.deepEqual(files[0].hunks[0].pre, ['const keep = 1;', 'const old = 2;', 'const tail = 3;']);
  assert.deepEqual(files[0].hunks[0].post, ['const keep = 1;', 'const new = 2;', 'const tail = 3;']);
});

test('applyUnifiedPatch is all-or-nothing: good context applies, bad context throws', () => {
  const present = new Map([
    ['a.js', 'const keep = 1;\nconst old = 2;\nconst tail = 3;\n'],
    ['c.txt', 'removing this line\n'],
  ]);
  const plan = applyUnifiedPatch(present, parseUnifiedPatch(DIFF));
  const byPath = new Map(plan.map(p => [p.path, p]));
  assert.equal(byPath.get('a.js').after, 'const keep = 1;\nconst new = 2;\nconst tail = 3;\n');
  assert.equal(byPath.get('b.txt').kind, 'create');
  assert.equal(byPath.get('b.txt').after, 'brand\nnew file\n');
  assert.equal(byPath.get('c.txt').kind, 'delete');

  // A stale context (file changed since the patch was authored) must throw,
  // not corrupt: the whole patch is refused.
  assert.throws(() => applyUnifiedPatch(new Map([['a.js', 'DIFFERENT CONTENT\n']]), parseUnifiedPatch(DIFF)),
    /context not found/);
  // Creating over an existing file is refused (a.js validates first, so it must
  // be present with matching context; then b.txt's create is refused).
  assert.throws(() => applyUnifiedPatch(
    new Map([['a.js', 'const keep = 1;\nconst old = 2;\nconst tail = 3;\n'], ['b.txt', 'already here\n']]),
    parseUnifiedPatch(DIFF)),
    /already exists/);
});

test('the apply_patch tool writes all files on disk under one approval', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'apply-patch-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'a.js'), 'const keep = 1;\nconst old = 2;\nconst tail = 3;\n');
  await writeFile(join(cwd, 'c.txt'), 'removing this line\n');

  const allow = createTools({ cwd, approve: async () => true, timeout: 1000 });
  const result = await allow('apply_patch', { patch: DIFF });
  assert.equal(result.files, 3);
  assert.equal(await readFile(join(cwd, 'a.js'), 'utf8'), 'const keep = 1;\nconst new = 2;\nconst tail = 3;\n');
  assert.equal(await readFile(join(cwd, 'b.txt'), 'utf8'), 'brand\nnew file\n');
  assert.rejects(readFile(join(cwd, 'c.txt'), 'utf8'), e => e.code === 'ENOENT', 'deleted file is gone');

  // A denied approval writes NOTHING (the patch is atomic: validation + a single
  // gate happen before any byte lands). Restore the source files the way the DIFF
  // expects them (the allow run above created b.txt and deleted c.txt), so the
  // patch validates cleanly and actually reaches the approval gate.
  await rm(join(cwd, 'b.txt'), { force: true });
  await writeFile(join(cwd, 'a.js'), 'const keep = 1;\nconst old = 2;\nconst tail = 3;\n');
  await writeFile(join(cwd, 'c.txt'), 'removing this line\n');
  const deny = createTools({ cwd, approve: async () => false, timeout: 1000 });
  await assert.rejects(deny('apply_patch', { patch: DIFF }), /denied/i);
  assert.equal(await readFile(join(cwd, 'a.js'), 'utf8'), 'const keep = 1;\nconst old = 2;\nconst tail = 3;\n', 'a denied patch leaves files untouched');
});
