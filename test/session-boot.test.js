import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const CLI = join(import.meta.dirname, '..', 'cli', 'flow.js');
const CHAR_CLI = join(import.meta.dirname, '..', 'character-flow', 'cli', 'flow.js');

const answer = content => ({ choices: [{ message: { role: 'assistant', content } }] });

function makeMockServer(t) {
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [] }));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(answer('Session response ok')));
  });
  server.listen(0, '127.0.0.1');
  t.after(() => server.close());
  return server;
}

async function runCli(cliPath, args, cwd, port) {
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd,
    env: {
      ...process.env,
      OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      OPENAI_API_KEY: 'mock-key',
      OPENAI_MODEL: 'mock-model'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; });
  child.stderr.on('data', c => { stderr += c; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}

test('boot with corrupt session JSON does not crash and logs gentle warning', async t => {
  const server = makeMockServer(t);
  await once(server, 'listening');
  const port = server.address().port;

  const tmp = await mkdtemp(join(tmpdir(), 'sword-corrupt-session-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const flowDir = join(tmp, '.sword');
  await mkdir(flowDir, { recursive: true });
  // Corrupted session JSON
  await writeFile(join(flowDir, 'corrupt.json'), '{"cwd":"' + tmp + '", "messages": [invalid json');

  const res = await runCli(CLI, ['--session', 'corrupt', '--prompt', 'hello', '--json'], tmp, port);
  assert.equal(res.code, 0, `Process crashed with code ${res.code}: ${res.stderr}`);
  assert.match(res.stderr, /Warning: Failed to load session "corrupt"/);
  assert.match(res.stderr, /Starting a clean session/);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.response, 'Session response ok');
});

test('boot with oversized session file (>1MB) does not crash and starts clean session', async t => {
  const server = makeMockServer(t);
  await once(server, 'listening');
  const port = server.address().port;

  const tmp = await mkdtemp(join(tmpdir(), 'sword-oversized-session-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const flowDir = join(tmp, '.sword');
  await mkdir(flowDir, { recursive: true });
  // File size > 1,000,000 bytes
  const largeData = 'x'.repeat(1000005);
  await writeFile(join(flowDir, 'oversized.json'), JSON.stringify({ cwd: tmp, padding: largeData }));

  const res = await runCli(CLI, ['--session', 'oversized', '--prompt', 'hello', '--json'], tmp, port);
  assert.equal(res.code, 0, `Process crashed with code ${res.code}: ${res.stderr}`);
  assert.match(res.stderr, /Warning: Failed to load session "oversized"/);
  assert.match(res.stderr, /Starting a clean session/);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.response, 'Session response ok');
});

test('boot with valid session loads prior messages cleanly', async t => {
  const server = makeMockServer(t);
  await once(server, 'listening');
  const port = server.address().port;

  const tmp = await mkdtemp(join(tmpdir(), 'sword-valid-session-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const flowDir = join(tmp, '.sword');
  await mkdir(flowDir, { recursive: true });
  const validMessages = [
    { role: 'user', content: 'prior question' },
    { role: 'assistant', content: 'prior answer' }
  ];
  await writeFile(join(flowDir, 'valid.json'), JSON.stringify({ cwd: tmp, messages: validMessages }));

  const res = await runCli(CLI, ['--session', 'valid', '--prompt', 'new question', '--json'], tmp, port);
  assert.equal(res.code, 0, `Process crashed with code ${res.code}: ${res.stderr}`);
  assert.doesNotMatch(res.stderr, /Warning: Failed to load session/);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.response, 'Session response ok');
});

test('character-flow cli/flow.js also handles corrupt session gracefully', async t => {
  const server = makeMockServer(t);
  await once(server, 'listening');
  const port = server.address().port;

  const tmp = await mkdtemp(join(tmpdir(), 'char-flow-corrupt-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));

  const flowDir = join(tmp, '.sword');
  await mkdir(flowDir, { recursive: true });
  await writeFile(join(flowDir, 'broken.json'), '{ broken content');

  const res = await runCli(CHAR_CLI, ['--session', 'broken', '--prompt', 'hello', '--json'], tmp, port);
  assert.equal(res.code, 0, `Process crashed with code ${res.code}: ${res.stderr}`);
  assert.match(res.stderr, /Warning: Failed to load session "broken"/);
  assert.match(res.stderr, /Starting a clean session/);
});
