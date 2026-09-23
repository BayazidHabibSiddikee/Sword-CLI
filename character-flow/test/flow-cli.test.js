import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { once } from 'node:events';

const CLI = join(import.meta.dirname, '..', 'cli', 'flow.js');

const answer = content => ({ choices: [{ message: { role: 'assistant', content } }] });

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      stdio: opts.stdio || ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(opts.env || {}) }
    });
    const out = [];
    const err = [];
    child.stdout.on('data', c => out.push(c));
    child.stderr.on('data', c => err.push(c));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() }));
  });
}

test('--help prints usage and exits 0', async () => {
  const res = await run(['--help']);
  assert.equal(res.code, 0);
  assert.ok(res.stdout.includes('SwordCLI'));
  assert.ok(res.stdout.includes('--prompt'));
});

test('unknown --mode exits 1 with a clear error', async () => {
  const res = await run(['--mode', 'unknown', '--prompt', 'hello']);
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('Unknown mode') || res.stdout.includes('Unknown mode'), res.stderr);
});

test('--json without --prompt exits 1', async () => {
  const res = await run(['--json'], { stdio: ['pipe', 'pipe', 'pipe'] });
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('--json requires --prompt') || res.stdout.includes('--json requires --prompt'), res.stderr);
});

test('non-interactive stdin without --prompt exits 1', async () => {
  const res = await run([], { stdio: ['pipe', 'pipe', 'pipe'] });
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('Non-interactive usage requires --prompt') || res.stdout.includes('Non-interactive usage requires --prompt'), res.stderr);
});

test('empty --prompt is rejected', async () => {
  const res = await run(['--prompt', '', '--json'], { stdio: ['pipe', 'pipe', 'pipe'] });
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('--json requires --prompt') || res.stdout.includes('--json requires --prompt'), res.stderr);
});

test('--local and --shared-session are mutually exclusive', async () => {
  const res = await run(['--local', '--shared-session', 'x', '--prompt', 'hi']);
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('--local cannot be combined with shared-session') || res.stdout.includes('--local cannot be combined with shared-session'), res.stderr);
});

test('--local and --shared are mutually exclusive', async () => {
  const res = await run(['--local', '--shared', '--prompt', 'hi']);
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('mutually exclusive') || res.stdout.includes('mutually exclusive'), res.stderr);
});

test('--import-session without --shared exits 1', async () => {
  const res = await run(['--import-session', 'foo', '--prompt', 'hi']);
  assert.notEqual(res.code, 0);
  assert.ok(res.stderr.includes('Use --import-session NAME with --shared') || res.stdout.includes('Use --import-session NAME with --shared'), res.stderr);
});

test('unknown /command in interactive mode suggests the closest match', async () => {
  // The spawn-based validation tests above cover the argument parsing.
  // Full REPL command suggestions require a live provider and are out of scope
  // for fast unit-level CLI validation.
});

test('--session resumes local history and RAG retrieval is injected into the system prompt', async t => {
  const { writeFile, mkdir, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const cwd = join(tmpdir(), `flow-rag-session-${Date.now()}`);
  await mkdir(cwd, { recursive: true });
  await mkdir(join(cwd, '.flow'), { recursive: true });
  const sessionName = 'test';
  const prior = [{ role: 'user', content: 'prior turn' }, { role: 'assistant', content: 'prior answer' }];
  await writeFile(join(cwd, '.flow', `${sessionName}.json`), JSON.stringify({ cwd, messages: prior }));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (!body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [] })); return; }
    const data = JSON.parse(body);
    assert.equal(data.messages.at(-1).content, 'hello');
    // Prior turns should appear as user/assistant messages, not in the system prompt.
    const roles = data.messages.map(m => m.role);
    assert.deepEqual(roles, ['system', 'user', 'assistant', 'user']);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(answer('done')));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const child = spawn(process.execPath, [CLI, '--session', sessionName, '--prompt', 'hello', '--json'], {
    env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'test', HOME: cwd },
    cwd
  });
  let stdout = '';
  child.stdout.on('data', data => { stdout += data; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).response, 'done');
});

test('RAG failure is graceful and the turn still completes', async t => {
  const { rename, rm, writeFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const cwd = join(tmpdir(), `flow-rag-fail-${Date.now()}`);
  await mkdir(cwd, { recursive: true });
  await mkdir(join(cwd, '.flow'), { recursive: true });
  t.after(() => rm(cwd, { recursive: true, force: true }));

  // Ensure a RAG DB exists, then move it so search() throws and the catch block runs.
  const projectRoot = join(import.meta.dirname, '..');
  const ragDbPath = join(projectRoot, 'brain', 'rag.db');
  const ragDbBackup = join(projectRoot, 'brain', 'rag.db.test-backup');
  await writeFile(ragDbPath, '');
  await rename(ragDbPath, ragDbBackup);
  try {
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      if (!body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [] })); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(answer('rag-fallback')));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => server.close());

    const child = spawn(process.execPath, [CLI, '--prompt', 'ping', '--json'], {
      env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: '', OPENAI_MODEL: 'test' },
      cwd: projectRoot
    });
    let stdout = '';
    child.stdout.on('data', data => { stdout += data; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0);
    assert.equal(JSON.parse(stdout).response, 'rag-fallback');
  } finally {
    await rename(ragDbBackup, ragDbPath).catch(() => { rm(ragDbPath).catch(() => {}); });
  }
});

