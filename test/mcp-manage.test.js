// The `mcp` subcommand's pure logic: flag parsing and shape-preserving reads/writes.
// Integration (connect) is covered by the live `mcp test` path; here we assert the
// config mutations stay consumable by loadMcpConfig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseFlags, addServer, removeServer, serverContainer, runMcpCommand,
} from '../cli/mcpManage.js';
import { loadMcpConfig } from '../cli/mcpConfig.js';

test('parseFlags collects positionals, repeatable --env, and scoped flags', () => {
  const p = parseFlags(['demo', 'node', 'srv.mjs', '--env', 'A=1', '--env', 'B=2', '--global', '--disabled']);
  assert.deepEqual(p.positionals, ['demo', 'node', 'srv.mjs']);
  assert.deepEqual(p.env, [{ key: 'A', value: '1' }, { key: 'B', value: '2' }]);
  assert.equal(p.global, true);
  assert.equal(p.disabled, true);
  assert.throws(() => parseFlags(['--env', 'NOEQUALS']), /KEY=VALUE/);
  assert.throws(() => parseFlags(['--cwd']), /missing value/);
});

test('addServer preserves a file that already uses the mcpServers map shape', () => {
  const data = { mcpServers: { old: { command: 'old-cmd' } } };
  const replaced = addServer(data, 'new', { command: 'new-cmd', args: ['x'], env: [{ key: 'K', value: 'V' }] });
  assert.equal(replaced, false);
  assert.deepEqual(data.mcpServers.new, { command: 'new-cmd', args: ['x'], env: { K: 'V' } });
  assert.ok(data.mcpServers.old, 'existing entry untouched');
  // An idempotent re-add is a replacement, and updates in place without dupes.
  assert.equal(addServer(data, 'new', { command: 'newer' }), true);
  assert.equal(data.mcpServers.new.command, 'newer');
  assert.equal(Object.keys(data.mcpServers).length, 2, 'no duplicate key');
});

test('addServer preserves a file that already uses the servers array shape', () => {
  const data = { servers: [{ name: 'a', command: 'a-cmd' }] };
  addServer(data, 'b', { command: 'b-cmd', url: '' });
  assert.deepEqual(data.servers.map(s => s.name), ['a', 'b']);
  assert.equal(data.servers[1].command, 'b-cmd');
  // array shape also updates in place instead of duplicating
  addServer(data, 'a', { command: 'a-cmd2' });
  assert.equal(data.servers.length, 2, 're-add does not grow the array');
  assert.equal(data.servers[0].command, 'a-cmd2');
});

test('a fresh file defaults to the portable mcpServers map', () => {
  const data = {};
  addServer(data, 'x', { command: 'x-cmd' });
  assert.equal(serverContainer(data, 'x').shape, 'map');
  assert.deepEqual(data.mcpServers.x, { command: 'x-cmd' });
});

test('removeServer deletes from both shapes without touching others', () => {
  const mapData = { mcpServers: { a: { command: 'a' }, b: { command: 'b' } } };
  assert.equal(removeServer(mapData, 'a'), true);
  assert.deepEqual(Object.keys(mapData.mcpServers), ['b']);
  const arrData = { servers: [{ name: 'a', command: 'a' }, { name: 'b', command: 'b' }] };
  assert.equal(removeServer(arrData, 'b'), true);
  assert.deepEqual(arrData.servers.map(s => s.name), ['a']);
  assert.equal(removeServer(arrData, 'ghost'), false);
});

test('add+remove round-trip stays consumable by loadMcpConfig', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-manage-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, '.sword', 'mcp.json');
  const data = {};
  addServer(data, 'demo', { command: 'node', args: ['s.mjs'] });
  await mkdir(join(dir, '.sword'), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
  const { servers } = loadMcpConfig({ cwd: dir, env: { HOME: '' }, paths: [path] });
  assert.deepEqual(servers.map(s => s.name), ['demo']);
  assert.equal(servers[0].command, 'node');
  assert.deepEqual(servers[0].args, ['s.mjs']);
  assert.equal(removeServer(data, 'demo'), true);
  assert.equal(Object.keys(data.mcpServers).length, 0);
});

test('runMcpCommand prints help in both token forms and returns 0', async () => {
  let out = '';
  const orig = console.log;
  console.log = text => { out += `${text}\n`; };
  try {
    assert.equal(await runMcpCommand(['mcp', 'help']), 0);
    assert.equal(await runMcpCommand(['help']), 0, 'token form without the leading "mcp"');
  } finally { console.log = orig; }
  assert.match(out, /mcp add\s+<name>/);
  assert.match(out, /mcp test\s+<name>/);
});

test('runMcpCommand rejects an unknown subcommand with a non-zero code', () => {
  let err = '';
  const origErr = console.error;
  const origLog = console.log;
  console.error = text => { err += `${text}\n`; };
  console.log = () => {};
  try { return runMcpCommand(['bogus']).then(code => {
    assert.equal(code, 2);
    assert.match(err, /unknown mcp subcommand: bogus/);
  }); } finally { console.error = origErr; console.log = origLog; }
});

