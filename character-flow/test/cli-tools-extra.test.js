import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools } from '../cli/tools.js';
async function fixture(t, approve) {
  const cwd = await mkdtemp(join(tmpdir(), 'flow-extra-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return { cwd, execute: createTools({ cwd, approve, timeout: 1000 }) };
}

test('verbose commands finish normally while captured output is bounded', async t => {
  const { execute } = await fixture(t, async () => true);
  const result = await execute('run_command', { command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(100000)); setTimeout(() => process.exit(0), 100)'] });
  assert.equal(result.exitCode, 0);
  assert.equal(result.truncated, true);
  assert.equal(result.stdout.length, 64000);
});
test('commands stop on timeout and report spawn failures', async t => {
  const { execute } = await fixture(t, async () => true);
  const result = await execute('run_command', { command: process.execPath, args: ['-e', 'setInterval(()=>{}, 100)'] });
  assert.equal(result.timedOut, true);
  await assert.rejects(execute('run_command', { command: '/nonexistent-flow-executable', args: [] }), /ENOENT/);
});
test('ambiguous edits and approval-time changes are refused', async t => {
  const { cwd, execute } = await fixture(t, async () => true);
  await writeFile(join(cwd, 'a'), 'repeat repeat');
  await execute('read_file', { path: 'a' });
  await assert.rejects(execute('edit_file', { path: 'a', old_text: 'repeat', new_text: 'x' }), /exactly once/);
  const changing = createTools({ cwd, approve: async () => { await writeFile(join(cwd, 'a'), 'external'); return true; } });
  await changing('read_file', { path: 'a' });
  await assert.rejects(changing('write_file', { path: 'a', content: 'overwrite' }), /during approval/);
});
