// G5 — test-command discovery: pick the project's real test command from its manifests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTestCommand } from '../cli/testCommand.js';

async function dir(t, make) {
  const cwd = await mkdtemp(join(tmpdir(), 'test-cmd-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await make(cwd);
  return cwd;
}

test('node project: test script + lockfile pick the package-manager verb', async t => {
  const cwd = await dir(t, async c => {
    await writeFile(join(c, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
    await writeFile(join(c, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  });
  const r = detectTestCommand(cwd);
  assert.deepEqual(r, { command: 'pnpm', args: ['test'], source: 'package.json scripts.test', raw: 'pnpm test' });
});

test('node project without a test script falls through to other markers', async t => {
  const cwd = await dir(t, async c => {
    await writeFile(join(c, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }));
    await writeFile(join(c, 'Cargo.toml'), '[package]\nname = "x"\n');
  });
  const r = detectTestCommand(cwd);
  assert.deepEqual([r.command, ...r.args], ['cargo', 'test']);
});

test('go / python / rust / java detection', async t => {
  const goDir = await dir(t, c => writeFile(join(c, 'go.mod'), 'module m\n'));
  assert.deepEqual(detectTestCommand(goDir).args, ['test', './...']);

  const pyDir = await dir(t, c => writeFile(join(c, 'pytest.ini'), '[pytest]\n'));
  assert.equal(detectTestCommand(pyDir).command, 'pytest');

  const javDir = await dir(t, c => writeFile(join(c, 'pom.xml'), '<project/>'));
  assert.deepEqual(detectTestCommand(javDir).args, ['test']);
});

test('a project with no recognizable test harness returns null', async t => {
  const cwd = await dir(t, c => writeFile(join(c, 'README.md'), 'hi\n'));
  assert.equal(detectTestCommand(cwd), null);
});
