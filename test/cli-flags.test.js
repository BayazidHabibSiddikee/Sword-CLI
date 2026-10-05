import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = join(import.meta.dirname, '..');
const CLI = join(ROOT, 'cli', 'flow.js');
const CHAR_CLI = join(ROOT, 'character-flow', 'cli', 'flow.js');
const SWORD = join(ROOT, 'sword.mjs');

const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

async function execProcess(file, args) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; });
  child.stderr.on('data', c => { stderr += c; });
  const [code] = await once(child, 'close');
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

test('cli/flow.js --version prints package version and exits 0', async () => {
  const res = await execProcess(CLI, ['--version']);
  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout, pkgVersion);
});

test('cli/flow.js -v prints package version and exits 0', async () => {
  const res = await execProcess(CLI, ['-v']);
  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout, pkgVersion);
});

test('cli/flow.js version positional argument prints package version and exits 0', async () => {
  const res = await execProcess(CLI, ['version']);
  assert.equal(res.code, 0, res.stderr);
  assert.equal(res.stdout, pkgVersion);
});

test('cli/flow.js help positional argument prints usage and exits 0', async () => {
  const res = await execProcess(CLI, ['help']);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Usage: sword/);
  assert.match(res.stdout, /--version, -v/);
});

test('character-flow/cli/flow.js --version and -v print version and exit 0', async () => {
  const resLong = await execProcess(CHAR_CLI, ['--version']);
  assert.equal(resLong.code, 0, resLong.stderr);
  assert.equal(resLong.stdout, pkgVersion);

  const resShort = await execProcess(CHAR_CLI, ['-v']);
  assert.equal(resShort.code, 0, resShort.stderr);
  assert.equal(resShort.stdout, pkgVersion);
});

test('sword.mjs --help intercepts early without starting background daemons', async () => {
  const start = Date.now();
  const res = await execProcess(SWORD, ['--help']);
  const elapsed = Date.now() - start;
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /Usage: sword/);
  assert.match(res.stdout, /--version, -v/);
  assert.ok(elapsed < 2000, `Expected fast exit (<2000ms), took ${elapsed}ms`);
  assert.equal(res.stderr, '', 'Should not log background service startup lines to stderr');
});

test('sword.mjs -h and help intercept early without starting background daemons', async () => {
  const resShort = await execProcess(SWORD, ['-h']);
  assert.equal(resShort.code, 0, resShort.stderr);
  assert.match(resShort.stdout, /Usage: sword/);
  assert.equal(resShort.stderr, '');

  const resCmd = await execProcess(SWORD, ['help']);
  assert.equal(resCmd.code, 0, resCmd.stderr);
  assert.match(resCmd.stdout, /Usage: sword/);
  assert.equal(resCmd.stderr, '');
});

test('sword.mjs --version and -v print version early and exit 0', async () => {
  const resLong = await execProcess(SWORD, ['--version']);
  assert.equal(resLong.code, 0, resLong.stderr);
  assert.equal(resLong.stdout, pkgVersion);
  assert.equal(resLong.stderr, '');

  const resShort = await execProcess(SWORD, ['-v']);
  assert.equal(resShort.code, 0, resShort.stderr);
  assert.equal(resShort.stdout, pkgVersion);
  assert.equal(resShort.stderr, '');
});
