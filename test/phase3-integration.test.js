// Phase 3 integration — cli/providerRetry.js, cli/capability.js and cli/usage.js
// wired into cli/flow.js.
//
// Covered here:
//   1. A 429 is retried with backoff and the turn still completes; the retry is
//      reported on stderr.
//   2. A 401 is NOT retried (auth needs a config fix, not another attempt) and the
//      degraded turn emits a structured capability_lost event instead of letting the
//      fallback prose look like a completed answer.
//   3. A completed turn appends a usage row to .sword/usage.jsonl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'cli', 'flow.js');
const answer = content => ({ choices: [{ message: { role: 'assistant', content } }] });

async function tempDir(prefix) {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

/**
 * A mock provider whose POST behaviour is scripted. GET /v1/models always answers so
 * model discovery succeeds; `onPost(count, body)` returns `{ status, body }`.
 */
async function provider(t, onPost) {
  let count = 0;
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (!raw) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ object: 'list', data: [{ id: 'test', object: 'model' }] })); return; }
    count += 1;
    const body = JSON.parse(raw);
    requests.push(body.messages);
    const { status = 200, body: reply } = onPost(count, body) ?? {};
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return { base: `http://127.0.0.1:${server.address().port}/v1`, requests, calls: () => count };
}

function spawnFlow(args, { cwd, env = {} } = {}) {
  const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  return { child, done: once(child, 'close').then(([code]) => ({ code, stdout, stderr })) };
}

test('a 429 is retried with backoff and the turn completes', async t => {
  const cwd = await tempDir('phase3-retry-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const { base, calls } = await provider(t, count => (count === 1
    ? { status: 429, body: { error: { message: 'rate limited' } } }
    : { status: 200, body: answer('recovered') }));

  const { done } = spawnFlow(['--prompt', 'hello', '--json', '--local'], {
    cwd, env: { OPENAI_BASE_URL: base, OPENAI_API_KEY: '', OPENAI_MODEL: 'test' }
  });
  const { code, stdout, stderr } = await done;

  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout).response, 'recovered');
  // The retry is observable, and the 429 was retried rather than surfaced.
  assert.match(stderr, /provider rate_limited failure — retry 1 in \d+ms/);
  assert.equal(calls(), 2, 'one 429 then one success — exactly one retry');
});

test('a 401 is not retried and emits a capability_lost event', { timeout: 60000 }, async t => {
  const cwd = await tempDir('phase3-auth-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const { base, calls } = await provider(t, () => ({ status: 401, body: { error: { message: 'invalid api key' } } }));

  const { done } = spawnFlow(['--prompt', 'hello', '--json', '--local'], {
    cwd, env: { OPENAI_BASE_URL: base, OPENAI_API_KEY: '', OPENAI_MODEL: 'test' }
  });
  const { stdout, stderr } = await done;

  // Auth failures must not be retried: the config is what is wrong.
  assert.doesNotMatch(stderr, /failure — retry \d/, 'a 401 must never be retried');
  assert.equal(calls(), 1, 'the provider was asked exactly once');
  // The degraded turn is a machine-readable fact, not just prose.
  assert.match(stderr, /capability_lost/);
  const out = JSON.parse(stdout);
  assert.equal(out.degraded, true);
  assert.equal(out.retryAttempts, 0);
  assert.equal(out.capability_lost.event, 'capability_lost');
});

test('a completed turn appends a usage row to .sword/usage.jsonl', async t => {
  const cwd = await tempDir('phase3-usage-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.sword'), { recursive: true });
  const { base } = await provider(t, () => ({ status: 200, body: answer('done') }));

  const { done } = spawnFlow(['--prompt', 'hello world', '--json', '--local'], {
    cwd, env: { OPENAI_BASE_URL: base, OPENAI_API_KEY: '', OPENAI_MODEL: 'test' }
  });
  const { code, stdout, stderr } = await done;
  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout).response, 'done');

  const raw = await readFile(join(cwd, '.sword', 'usage.jsonl'), 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'one row per completed turn');
  const row = JSON.parse(lines[0]);
  assert.equal(row.model, 'test');
  assert.equal(row.provider, 'openai-compatible');
  assert.ok(row.tokens_in > 0, 'prompt tokens are recorded');
  assert.ok(row.tokens_out > 0, 'completion tokens are recorded');
  assert.equal(row.estimated, true);
});
