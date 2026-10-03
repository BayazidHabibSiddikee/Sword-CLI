// Phase 4 — MCP config resolution: search order, the mcpServers/servers alias,
// secret expansion and safe redaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadMcpConfig, normaliseServers, expandSecrets, redactConfig, describeConfigSummary, REDACTED,
} from '../cli/mcpConfig.js';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'mcp-config-'));
  const home = await mkdtemp(join(tmpdir(), 'mcp-home-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { cwd, home };
}

test('no config file resolves to null (the SDK is never needed)', async t => {
  const { cwd, home } = await fixture(t);
  assert.equal(loadMcpConfig({ cwd, env: { HOME: home }, paths: null }), null);
});

test('both servers and mcpServers shapes are accepted and de-duplicated', () => {
  const { servers, errors } = normaliseServers({
    servers: [{ name: 'a', command: 'run-a' }],
    mcpServers: { b: { command: 'run-b' }, a: { command: 'dup' } },
  });
  assert.deepEqual(servers.map(s => s.name), ['a', 'b']);
  assert.ok(errors.some(e => /duplicate server name "a"/.test(e)));
});

test('the project config wins over the machine-wide one', async t => {
  const { cwd, home } = await fixture(t);
  await writeFile(join(cwd, 'mcp.json'), ''); // sanity: unrelated file is ignored
  await mkdir(join(cwd, '.sword'), { recursive: true });
  await writeFile(join(cwd, '.sword', 'mcp.json'), JSON.stringify({ mcpServers: { local: { command: 'local' } } }));
  await mkdir(join(home, '.config', 'sword'), { recursive: true });
  await writeFile(join(home, '.config', 'sword', 'mcp.json'), JSON.stringify({ mcpServers: { global: { command: 'global' } } }));

  const config = loadMcpConfig({ cwd, env: { HOME: home } });
  assert.equal(config.servers.length, 1);
  assert.equal(config.servers[0].name, 'local');
  assert.ok(config.path.endsWith(join('.sword', 'mcp.json')));
});

test('expandSecrets substitutes ${env:VAR} and blanks an unset variable', () => {
  const expanded = expandSecrets('Bearer ${env:TOKEN}', { TOKEN: 'abc123' });
  assert.equal(expanded, 'Bearer abc123');
  const missing = [];
  assert.equal(expandSecrets('${env:NOPE}', {}, name => missing.push(name)), '');
  assert.deepEqual(missing, ['NOPE']);
  // Arrays and nested objects are walked; a non-string scalar passes through.
  assert.deepEqual(expandSecrets({ a: ['${env:X}', 5] }, { X: 'v' }), { a: ['v', 5] });
});

test('redactConfig hides credentials by key and by value shape', () => {
  const redacted = redactConfig({
    name: 'alpha',
    env: { GITHUB_TOKEN: 'ghp_abcdefghijklmnopqrstuvwxyz0123', PLAIN: 'visible' },
    headers: { Authorization: 'Bearer xyz' },
    note: 'sk-abcdefghijklmnopqrstuvwx',
  });
  assert.equal(redacted.env.GITHUB_TOKEN, REDACTED);
  assert.equal(redacted.env.PLAIN, 'visible');
  assert.equal(redacted.headers.Authorization, REDACTED);
  assert.equal(redacted.note, REDACTED, 'a secret-shaped value is redacted even under a harmless key');
});

test('describeConfigSummary never leaks a command-line env', async t => {
  const { cwd, home } = await fixture(t);
  await mkdir(join(cwd, '.sword'), { recursive: true });
  await writeFile(join(cwd, '.sword', 'mcp.json'), JSON.stringify({
    mcpServers: { db: { command: 'mcp-db', args: ['--root', '/tmp'], env: { DB_PASSWORD: 'hunter2' } } },
  }));
  const config = loadMcpConfig({ cwd, env: { HOME: home } });
  const summary = describeConfigSummary(config);
  assert.deepEqual(summary, ['db (stdio, 2 args)']);
  assert.ok(!JSON.stringify(summary).includes('hunter2'));
});
